import type { FastifyInstance } from 'fastify'
import { db, sales, saleItems, products, auditLog } from '@storehub/db'
import { eq, and, sql } from 'drizzle-orm'
import { saleSchema } from '@storehub/schemas'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

export async function saleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/api/admin/sales', { preHandler: requirePermission('sales.view') }, async (request) => {
    const { page = '1', pageSize = '20' } = request.query as Record<string, string>
    const limit = Math.min(Number(pageSize), 100)
    const offset = (Number(page) - 1) * limit

    const items = await db.query.sales.findMany({
      where: (s, { eq }) => eq(s.tenantId, request.tenant.id),
      limit, offset,
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    })
    return { items, page: Number(page), pageSize: limit }
  })

  app.get('/api/admin/sales/:id', { preHandler: requirePermission('sales.view') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const sale = await db.query.sales.findFirst({
      where: (s, { eq, and }) => and(eq(s.id, id), eq(s.tenantId, request.tenant.id)),
      with: { items: true },
    })
    if (!sale) return reply.code(404).send({ error: 'Not found' })
    return sale
  })

  app.post('/api/admin/sales', { preHandler: requirePermission('sales.create') }, async (request, reply) => {
    const body = saleSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const { items, paymentMethod, discount, tip, notes, saleDate } = body.data
    const tenantId = request.tenant.id
    const userId = request.user.id

    // Determine if backdate
    const isBackdated = saleDate && new Date(saleDate).toDateString() !== new Date().toDateString()
    if (isBackdated && !request.user.permissions.includes('sales.backdate')) {
      return reply.code(403).send({ error: 'Permission sales.backdate required' })
    }

    // Validate stock and compute totals
    let total = 0
    const saleItemValues = []
    for (const item of items) {
      const product = await db.query.products.findFirst({ where: (p, { eq, and }) => and(eq(p.id, item.productId), eq(p.tenantId, tenantId)) })
      if (!product) return reply.code(400).send({ error: `Product ${item.productId} not found` })
      if (product.stock < item.quantity) return reply.code(400).send({ error: `Insufficient stock for ${product.name}` })

      const originalPrice = Number(product.price)
      const unitPrice = item.unitPrice
      const subtotal = unitPrice * item.quantity
      total += subtotal

      // Audit price override
      if (item.overrideReason && unitPrice !== originalPrice) {
        if (!request.user.permissions.includes('sales.override_price')) {
          return reply.code(403).send({ error: 'Permission sales.override_price required' })
        }
      }

      saleItemValues.push({ productId: item.productId, quantity: item.quantity, unitPrice: String(unitPrice), originalPrice: String(originalPrice), overrideReason: item.overrideReason ?? null, subtotal: String(subtotal) })
    }

    total = total - discount + tip
    const status = isBackdated ? 'pending_approval' : 'approved'

    const [sale] = await db.insert(sales).values({
      tenantId, userId, total: String(total), discount: String(discount), tip: String(tip),
      paymentMethod, notes: notes ?? null, status: status as any,
      saleDate: saleDate ? new Date(saleDate) : new Date(),
    }).returning()

    await db.insert(saleItems).values(saleItemValues.map(i => ({ ...i, saleId: sale.id })))

    // Deduct stock only if approved
    if (status === 'approved') {
      for (const item of items) {
        await db.update(products).set({ stock: sql`${products.stock} - ${item.quantity}` }).where(eq(products.id, item.productId))
      }
    }

    // Audit price overrides
    for (const item of saleItemValues) {
      if (item.overrideReason) {
        await db.insert(auditLog).values({
          tenantId, userId, eventType: 'price_override', entityType: 'sale_item', entityId: sale.id,
          payload: { productId: item.productId, originalPrice: item.originalPrice, unitPrice: item.unitPrice, reason: item.overrideReason },
        })
      }
    }

    return reply.code(201).send(sale)
  })
}
