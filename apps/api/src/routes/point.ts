import type { FastifyInstance } from 'fastify'
import { db, sales, saleItems, products } from '@storehub/db'
import { eq, sql } from 'drizzle-orm'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'
import crypto from 'crypto'

export async function pointRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Create a Point order (sends payment to terminal)
  app.post('/api/admin/point/charge', { preHandler: requirePermission('sales.create') }, async (request, reply) => {
    const config = request.tenant.config as any
    const accessToken = config?.payments?.pointAccessToken
    const terminalId = config?.payments?.pointTerminalId

    if (!accessToken || !terminalId) {
      return reply.code(400).send({ error: 'Terminal Point no configurada. Agrega el Access Token y Terminal ID en Configuración → Pagos.' })
    }

    const { amount, description, items } = request.body as { amount: number; description?: string; items?: any[] }
    if (!amount || amount <= 0) return reply.code(400).send({ error: 'amount is required and must be positive' })

    const externalReference = `pos-${crypto.randomUUID().slice(0, 8)}`
    try {
      const res = await fetch('https://api.mercadopago.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'X-Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          type: 'point',
          external_reference: `pos-${crypto.randomUUID().slice(0, 8)}`,
          expiration_time: 'PT5M',
          transactions: { payments: [{ amount: amount.toFixed(2) }] },
          config: {
            point: { terminal_id: terminalId, print_on_terminal: 'no_ticket' },
            payment_method: { default_type: 'credit_card' },
          },
          description: description ?? 'Venta POS',
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        request.log.error({ status: res.status, data }, '[point] Failed to create order')
        return reply.code(400).send({ error: data.message ?? 'Error al enviar cobro a la terminal' })
      }

      request.log.info({ orderId: data.id, terminalId, amount }, '[point] Order sent to terminal')
      return { orderId: data.id, status: data.status, externalReference, items }
    } catch (e: any) {
      request.log.error({ error: e.message }, '[point] Error creating order')
      return reply.code(500).send({ error: 'Error de conexión con Mercado Pago' })
    }
  })

  // Poll order status
  app.get('/api/admin/point/status/:orderId', { preHandler: requirePermission('sales.create') }, async (request, reply) => {
    const config = request.tenant.config as any
    const accessToken = config?.payments?.pointAccessToken
    if (!accessToken) return reply.code(400).send({ error: 'MP not configured' })

    const { orderId } = request.params as { orderId: string }

    try {
      const res = await fetch(`https://api.mercadopago.com/v1/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (!res.ok) return reply.code(400).send({ error: 'Order not found' })

      return {
        status: data.status,
        statusDetail: data.status_detail,
        paymentStatus: data.transactions?.payments?.[0]?.status,
        amount: data.transactions?.payments?.[0]?.paid_amount ?? data.transactions?.payments?.[0]?.amount,
      }
    } catch {
      return reply.code(500).send({ error: 'Error checking status' })
    }
  })

  // Cancel a Point order
  app.post('/api/admin/point/cancel/:orderId', { preHandler: requirePermission('sales.create') }, async (request, reply) => {
    const config = request.tenant.config as any
    const accessToken = config?.payments?.pointAccessToken
    if (!accessToken) return reply.code(400).send({ error: 'MP not configured' })

    const { orderId } = request.params as { orderId: string }

    try {
      const res = await fetch(`https://api.mercadopago.com/v1/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'X-Idempotency-Key': crypto.randomUUID(),
        },
      })
      const data = await res.json()
      return { status: data.status ?? 'canceled' }
    } catch {
      return reply.code(500).send({ error: 'Error canceling order' })
    }
  })

  // Get polling interval (so frontend knows how often to poll)
  app.get('/api/admin/point/config', async () => {
    return { pollingInterval: Number(process.env.POINT_POLLING_INTERVAL ?? '3000') }
  })

  // Register sale after Point payment is confirmed (called from frontend after polling)
  app.post('/api/admin/point/register-sale', { preHandler: requirePermission('sales.create') }, async (request, reply) => {
    const { orderId, items, total, discount, tip } = request.body as {
      orderId: string; items: Array<{ productId: string; name: string; quantity: number; price: number; modifiers?: any[] }>
      total: number; discount?: number; tip?: number
    }
    if (!orderId || !items?.length) return reply.code(400).send({ error: 'orderId and items required' })

    // Idempotency: check if already registered
    const existing = await db.query.sales.findFirst({
      where: (s, { eq, and }) => and(eq(s.tenantId, request.tenant.id), eq(s.notes, `point:${orderId}`)),
    })
    if (existing) return { ok: true, saleId: existing.id, duplicate: true }

    const tenantId = request.tenant.id
    const tz = 'America/Mexico_City'
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })

    const [sale] = await db.insert(sales).values({
      tenantId,
      userId: request.user.id,
      total: String(total),
      discount: String(discount ?? 0),
      tip: String(tip ?? 0),
      paymentMethod: 'card',
      notes: `point:${orderId}`,
      status: 'approved',
      saleDate: new Date(today + 'T00:00:00.000Z'),
    }).returning()

    for (const item of items) {
      await db.insert(saleItems).values({
        saleId: sale.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: String(item.price),
        originalPrice: String(item.price - (item.modifiers?.reduce((s: number, m: any) => s + m.price, 0) ?? 0)),
        subtotal: String(item.price * item.quantity),
        modifiers: item.modifiers ?? [],
      })
    }

    // Deduct stock
    for (const item of items) {
      if (item.productId) {
        await db.update(products).set({ stock: sql`${products.stock} - ${item.quantity}` }).where(eq(products.id, item.productId))
      }
    }

    request.log.info({ orderId, saleId: sale.id, total }, '[point] Sale registered from POS')
    return { ok: true, saleId: sale.id }
  })

  // Print custom ticket on terminal after payment
  app.post('/api/admin/point/print-ticket', { preHandler: requirePermission('sales.create') }, async (request, reply) => {
    const config = request.tenant.config as any
    const accessToken = config?.payments?.pointAccessToken
    const terminalId = config?.payments?.pointTerminalId
    if (!accessToken || !terminalId) return reply.code(400).send({ error: 'Point not configured' })

    const { items, total, tenantName, discount, tip, paymentMethod } = request.body as {
      items: Array<{ name: string; quantity: number; price: number; modifiers?: Array<{ name: string; price: number }> }>
      total: number; tenantName: string; discount?: number; tip?: number; paymentMethod?: string
    }

    // Build ticket content with MP tags
    const now = new Date()
    const dateStr = now.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })

    let content = `{center}{w}${tenantName}{/w}{br}{br}`
    content += `{s}${dateStr} ${timeStr}{/s}{br}`
    content += `--------------------------------{br}`

    for (const item of items) {
      content += `{s}${item.quantity}x ${item.name}{/s}{br}`
      if (item.modifiers?.length) {
        for (const m of item.modifiers) {
          content += `{s}   + ${m.name} $${m.price.toFixed(2)}{/s}{br}`
        }
      }
      content += `{s}   $${(item.price * item.quantity).toFixed(2)}{/s}{br}`
    }

    content += `--------------------------------{br}`
    if (discount && discount > 0) content += `{s}Descuento: -$${discount.toFixed(2)}{/s}{br}`
    if (tip && tip > 0) content += `{s}Propina: +$${tip.toFixed(2)}{/s}{br}`
    content += `{b}TOTAL: $${total.toFixed(2)}{/b}{br}`
    content += `{s}Pago: ${paymentMethod === 'card' ? 'Tarjeta' : paymentMethod ?? 'Tarjeta'}{/s}{br}`
    content += `{br}{center}{s}¡Gracias por su compra!{/s}{br}`

    // Pad to minimum 100 chars
    while (content.length < 100) content += ' '

    try {
      const res = await fetch('https://api.mercadopago.com/terminals/v1/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'X-Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          type: 'print',
          external_reference: `ticket-${crypto.randomUUID().slice(0, 8)}`,
          config: { point: { terminal_id: terminalId, subtype: 'custom' } },
          content,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        request.log.error({ data }, '[point] Print ticket failed')
        return reply.code(400).send({ error: 'Error al imprimir ticket' })
      }
      return { ok: true, actionId: data.id }
    } catch (e: any) {
      request.log.error({ error: e.message }, '[point] Print error')
      return reply.code(500).send({ error: 'Error de conexión' })
    }
  })
}
