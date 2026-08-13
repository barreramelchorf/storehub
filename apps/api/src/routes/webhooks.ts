import type { FastifyInstance } from 'fastify'
import { db, sales, saleItems, tenants } from '@storehub/db'
import { eq } from 'drizzle-orm'

export async function webhookRoutes(app: FastifyInstance) {
  // Mercado Pago payment webhook
  app.post('/api/webhooks/mercadopago', async (request, reply) => {
    const { type, data } = request.body as { type?: string; data?: { id?: string } }

    // Only process payment notifications
    if (type !== 'payment' || !data?.id) {
      return reply.code(200).send({ ok: true, ignored: true })
    }

    const paymentId = data.id
    request.log.info({ paymentId, type }, '[webhook/mp] Payment notification received')

    // Look up payment in MP to get details and external_reference
    // We need to find the tenant first — check external_reference from the payment
    const allTenantsList = await db.query.tenants.findMany()
    let paymentData: any = null
    let matchedTenant: any = null

    for (const tenant of allTenantsList) {
      const config = tenant.config as any
      const accessToken = config?.payments?.mercadoPagoAccessToken
      if (!accessToken) continue

      try {
        const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        })
        if (res.ok) {
          paymentData = await res.json()
          matchedTenant = tenant
          break
        }
      } catch {}
    }

    if (!paymentData || !matchedTenant) {
      request.log.warn({ paymentId }, '[webhook/mp] Payment not found in any tenant')
      return reply.code(200).send({ ok: true, notFound: true })
    }

    // Only process approved payments
    if (paymentData.status !== 'approved') {
      request.log.info({ paymentId, status: paymentData.status }, '[webhook/mp] Payment not approved')
      return reply.code(200).send({ ok: true, status: paymentData.status })
    }

    // Idempotency: check if we already processed this payment
    const existingSale = await db.query.sales.findFirst({
      where: (s, { eq, and }) => and(eq(s.tenantId, matchedTenant.id), eq(s.notes, `mp:${paymentId}`)),
    })
    if (existingSale) {
      request.log.info({ paymentId, saleId: existingSale.id }, '[webhook/mp] Already processed')
      return reply.code(200).send({ ok: true, duplicate: true })
    }

    // Parse cart data from external_reference
    let cartItems: Array<{ name: string; quantity: number; unitPrice: number; modifiers?: Array<{ id: string; name: string; price: number }> }> = []
    try {
      const ref = JSON.parse(paymentData.external_reference ?? '{}')
      cartItems = ref.items ?? []
    } catch {
      request.log.warn({ paymentId }, '[webhook/mp] Could not parse external_reference')
    }

    const total = paymentData.transaction_amount
    const tenantId = matchedTenant.id
    const tz = 'America/Mexico_City'
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })

    // Create the sale
    const [sale] = await db.insert(sales).values({
      tenantId,
      userId: tenantId, // Online order — no user session
      total: String(total),
      discount: '0',
      tip: '0',
      paymentMethod: 'card',
      notes: `mp:${paymentId}`,
      status: 'approved',
      saleDate: new Date(today + 'T00:00:00.000Z'),
    }).returning()

    // Create sale items
    for (const item of cartItems) {
      const modifiersTotal = item.modifiers?.reduce((s, m) => s + m.price, 0) ?? 0
      const unitPrice = item.unitPrice
      await db.insert(saleItems).values({
        saleId: sale.id,
        productId: sale.id, // Placeholder for online orders
        quantity: item.quantity,
        unitPrice: String(unitPrice),
        originalPrice: String(unitPrice - modifiersTotal),
        subtotal: String(unitPrice * item.quantity),
        modifiers: item.modifiers ?? [],
      })
    }

    request.log.info({ paymentId, saleId: sale.id, total, items: cartItems.length }, '[webhook/mp] Sale created')
    return reply.code(200).send({ ok: true, saleId: sale.id })
  })
}
