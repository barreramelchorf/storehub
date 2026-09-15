import type { FastifyInstance } from 'fastify'
import { db, sales, saleItems, products } from '@storehub/db'
import { eq, sql } from 'drizzle-orm'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'
import crypto from 'crypto'
import { pointMockEnabled, createMockOrder, getMockOrder, resolveMockOrder, cancelMockOrder } from '../lib/point-mock.js'

export async function pointRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Create a Point order (sends payment to terminal)
  app.post('/api/admin/point/charge', { preHandler: requirePermission('sales.create') }, async (request, reply) => {
    const { amount, description, items } = request.body as { amount: number; description?: string; items?: any[] }
    if (!amount || amount <= 0) return reply.code(400).send({ error: 'amount is required and must be positive' })

    // Staging simulator
    if (pointMockEnabled()) {
      const { orderId, status } = createMockOrder(amount)
      request.log.info({ orderId, amount }, '[point-mock] Order created (simulator)')
      return { orderId, status, externalReference: `mock-${orderId}`, items }
    }

    const config = request.tenant.config as any
    const accessToken = config?.payments?.pointAccessToken
    const terminalId = config?.payments?.pointTerminalId

    if (!accessToken || !terminalId) {
      return reply.code(400).send({ error: 'Terminal Point no configurada. Agrega el Access Token y Terminal ID en Configuración → Pagos.' })
    }

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
    const { orderId } = request.params as { orderId: string }

    // Staging simulator
    if (pointMockEnabled()) {
      const mock = getMockOrder(orderId)
      if (!mock) return reply.code(400).send({ error: 'Order not found' })
      return mock
    }

    const config = request.tenant.config as any
    const accessToken = config?.payments?.pointAccessToken
    if (!accessToken) return reply.code(400).send({ error: 'MP not configured' })

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
    const { orderId } = request.params as { orderId: string }

    // Staging simulator
    if (pointMockEnabled()) {
      cancelMockOrder(orderId)
      return { status: 'canceled' }
    }

    const config = request.tenant.config as any
    const accessToken = config?.payments?.pointAccessToken
    if (!accessToken) return reply.code(400).send({ error: 'MP not configured' })

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

  // [Simulator only] Manually resolve a mock order as paid or canceled
  app.post('/api/admin/point/mock-resolve/:orderId', { preHandler: requirePermission('sales.create') }, async (request, reply) => {
    if (!pointMockEnabled()) return reply.code(404).send({ error: 'Not found' })
    const { orderId } = request.params as { orderId: string }
    const { outcome } = request.body as { outcome: 'paid' | 'canceled' }
    if (outcome !== 'paid' && outcome !== 'canceled') return reply.code(400).send({ error: 'outcome must be paid or canceled' })
    const ok = resolveMockOrder(orderId, outcome)
    if (!ok) return reply.code(400).send({ error: 'Order not found' })
    return { ok: true, outcome }
  })

  // Expose whether the mock is active (so the POS can show test controls)
  app.get('/api/admin/point/mock-status', async () => {
    return { mockEnabled: pointMockEnabled() }
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

  // Print custom ticket on terminal (after payment, or a pre-payment bill/cuenta)
  app.post('/api/admin/point/print-ticket', { preHandler: requirePermission('sales.create') }, async (request, reply) => {
    const { items, total, tenantName, discount, tip, paymentMethod, isBill } = request.body as {
      items: Array<{ name: string; quantity: number; price: number; modifiers?: Array<{ name: string; price: number }> }>
      total: number; tenantName: string; discount?: number; tip?: number; paymentMethod?: string; isBill?: boolean
    }

    // Staging simulator — just log, don't call MP
    if (pointMockEnabled()) {
      request.log.info({ tenantName, total, itemCount: items?.length, isBill: !!isBill }, `[point-mock] Print ${isBill ? 'bill/cuenta' : 'ticket'} (simulator, not printed)`)
      return { ok: true, actionId: `mock-print-${Date.now()}` }
    }

    const config = request.tenant.config as any
    const accessToken = config?.payments?.pointAccessToken
    const terminalId = config?.payments?.pointTerminalId
    if (!accessToken || !terminalId) return reply.code(400).send({ error: 'Point not configured' })

    // Build ticket content with MP tags
    const now = new Date()
    const dateStr = now.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })

    let content = `{center}{w}${tenantName}{/w}{br}{br}`
    if (isBill) content += `{center}{b}CUENTA{/b}{br}`
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
    if (isBill) {
      content += `{br}{center}{s}Esta cuenta no es un{/s}{br}`
      content += `{center}{s}comprobante de pago{/s}{br}`
    } else {
      content += `{s}Pago: ${paymentMethod === 'card' ? 'Tarjeta' : paymentMethod ?? 'Tarjeta'}{/s}{br}`
      content += `{br}{center}{s}¡Gracias por su compra!{/s}{br}`
    }

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
