import type { FastifyInstance } from 'fastify'
import { db, sales, saleItems } from '@storehub/db'
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
          external_reference: externalReference,
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
}
