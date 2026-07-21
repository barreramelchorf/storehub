import type { FastifyInstance } from 'fastify'
import { db, sales, saleItems, products, auditLog } from '@storehub/db'
import { eq, sql } from 'drizzle-orm'
import { saleSchema } from '@storehub/schemas'
import { authenticate } from '../middleware/auth.js'
import { requirePermission, requireAnyPermission } from '../middleware/permissions.js'

export async function saleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/api/admin/sales', { preHandler: requireAnyPermission('sales.view', 'sales.delete') }, async (request) => {
    const { page = '1', pageSize = '20', status: statusFilter } = request.query as Record<string, string>
    const limit = Math.min(Number(pageSize), 100)
    const offset = (Number(page) - 1) * limit

    const items = await db.query.sales.findMany({
      where: (s, { eq, and }) => {
        const conditions = [eq(s.tenantId, request.tenant.id)]
        if (statusFilter) conditions.push(eq(s.status, statusFilter as any))
        return and(...conditions)
      },
      with: { user: { columns: { id: true, username: true, email: true } } },
      limit, offset,
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    })
    return { items, page: Number(page), pageSize: limit }
  })

  app.get('/api/admin/sales/:id', { preHandler: requireAnyPermission('sales.view', 'sales.delete') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const sale = await db.query.sales.findFirst({
      where: (s, { eq, and }) => and(eq(s.id, id), eq(s.tenantId, request.tenant.id)),
      with: { items: { with: { product: { columns: { id: true, name: true } } } }, user: { columns: { id: true, username: true, email: true } } },
    })
    if (!sale) return reply.code(404).send({ error: 'Not found' })

    // If cancelled, fetch the reason from audit log
    let cancelReason: string | null = null
    if (sale.status === 'cancelled') {
      const log = await db.query.auditLog.findFirst({
        where: (a, { eq, and }) => and(eq(a.entityId, id), eq(a.eventType, 'sale_deleted')),
        orderBy: (a, { desc }) => [desc(a.createdAt)],
      })
      cancelReason = (log?.payload as any)?.reason ?? null
    }

    return { ...sale, cancelReason }
  })

  app.post('/api/admin/sales', { preHandler: requirePermission('sales.create') }, async (request, reply) => {
    const body = saleSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const { items, paymentMethod, discount, tip, notes, saleDate } = body.data
    const tenantId = request.tenant.id
    const userId = request.user.id

    const isBackdated = (() => {
      if (!saleDate) return false
      const tz = process.env.BUSINESS_TIMEZONE ?? 'America/Mexico_City'
      const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
      const submitted = new Date(saleDate).toISOString().slice(0, 10)
      return submitted !== today
    })()

    // Admin/manager can backdate directly; others go through approval
    const canAutoApprove = request.user.permissions.includes('sales.backdate')
    const status = isBackdated && !canAutoApprove ? 'pending_approval' : 'approved'

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

      if (item.overrideReason && unitPrice !== originalPrice) {
        if (!request.user.permissions.includes('sales.override_price')) {
          return reply.code(403).send({ error: 'Permission sales.override_price required' })
        }
      }

      saleItemValues.push({ productId: item.productId, quantity: item.quantity, unitPrice: String(unitPrice), originalPrice: String(originalPrice), overrideReason: item.overrideReason ?? null, modifiers: item.modifiers ?? [], subtotal: String(subtotal) })
    }

    total = total - discount + tip

    const [sale] = await db.insert(sales).values({
      tenantId, userId, total: String(total), discount: String(discount), tip: String(tip),
      paymentMethod, notes: notes ?? null, status: status as any,
      saleDate: saleDate ? new Date(saleDate) : (() => {
        // Default to today's date in business timezone (midnight UTC of the calendar day)
        const tz = process.env.BUSINESS_TIMEZONE ?? 'America/Mexico_City'
        const today = new Date().toLocaleDateString('en-CA', { timeZone: tz }) // "2026-07-08"
        return new Date(today + 'T00:00:00.000Z')
      })(),
    }).returning()

    await db.insert(saleItems).values(saleItemValues.map(i => ({ ...i, saleId: sale.id })))

    if (status === 'approved') {
      for (const item of items) {
        await db.update(products).set({ stock: sql`${products.stock} - ${item.quantity}` }).where(eq(products.id, item.productId))
      }
    }

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

  app.post('/api/admin/sales/:id/approve', { preHandler: requirePermission('sales.view') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: string }
    if (!['approved', 'rejected'].includes(status)) return reply.code(400).send({ error: 'Invalid status' })

    const sale = await db.query.sales.findFirst({
      where: (s, { eq, and }) => and(eq(s.id, id), eq(s.tenantId, request.tenant.id)),
    })
    if (!sale) return reply.code(404).send({ error: 'Sale not found' })
    if (sale.status !== 'pending_approval' && sale.status !== 'pending_delete') return reply.code(400).send({ error: 'Sale is not pending' })

    if (sale.status === 'pending_delete') {
      // Approving a delete request → cancel the sale and revert stock
      if (status === 'approved') {
        await db.update(sales).set({ status: 'cancelled' as any }).where(eq(sales.id, id))
        const items = await db.query.saleItems.findMany({ where: (si, { eq }) => eq(si.saleId, id) })
        for (const item of items) {
          await db.update(products).set({ stock: sql`${products.stock} + ${item.quantity}` }).where(eq(products.id, item.productId))
        }
        await db.insert(auditLog).values({
          tenantId: request.tenant.id, userId: request.user.id,
          eventType: 'sale_deleted', entityType: 'sale', entityId: id,
          payload: { action: 'approved_delete', total: sale.total, approvedBy: request.user.id },
        })
      } else {
        // Rejected delete → revert to approved
        await db.update(sales).set({ status: 'approved' as any }).where(eq(sales.id, id))
        await db.insert(auditLog).values({
          tenantId: request.tenant.id, userId: request.user.id,
          eventType: 'sale_delete_rejected', entityType: 'sale', entityId: id,
          payload: { action: 'rejected_delete' },
        })
      }
    } else {
      // Regular approval (backdated sale)
      await db.update(sales).set({ status: status as any }).where(eq(sales.id, id))
      if (status === 'approved') {
        const items = await db.query.saleItems.findMany({ where: (si, { eq }) => eq(si.saleId, id) })
        for (const item of items) {
          await db.update(products).set({ stock: sql`${products.stock} - ${item.quantity}` }).where(eq(products.id, item.productId))
        }
      }
      await db.insert(auditLog).values({
        tenantId: request.tenant.id, userId: request.user.id,
        eventType: 'sale_backdated', entityType: 'sale', entityId: id,
        payload: { action: status },
      })
    }

    return { ok: true }
  })

  // DELETE /api/admin/sales/:id — admin/manager delete directly, cashier must use request-delete
  app.delete('/api/admin/sales/:id', { preHandler: requirePermission('sales.delete') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { reason } = request.body as { reason?: string } || {}

    const sale = await db.query.sales.findFirst({
      where: (s, { eq, and }) => and(eq(s.id, id), eq(s.tenantId, request.tenant.id)),
    })
    if (!sale) return reply.code(404).send({ error: 'Sale not found' })
    if (sale.status === 'cancelled') return reply.code(400).send({ error: 'Sale is already cancelled' })

    // Check if user is admin/manager (has users.manage) — direct delete
    const canDirectDelete = request.user.permissions.includes('users.manage')
    if (!canDirectDelete) {
      return reply.code(403).send({ error: 'Use POST /api/admin/sales/:id/request-delete for approval flow' })
    }

    // Cancel the sale
    await db.update(sales).set({ status: 'cancelled' as any }).where(eq(sales.id, id))

    // Revert stock if sale was approved
    if (sale.status === 'approved') {
      const items = await db.query.saleItems.findMany({ where: (si, { eq }) => eq(si.saleId, id) })
      for (const item of items) {
        await db.update(products).set({ stock: sql`${products.stock} + ${item.quantity}` }).where(eq(products.id, item.productId))
      }
    }

    // Audit log
    await db.insert(auditLog).values({
      tenantId: request.tenant.id, userId: request.user.id,
      eventType: 'sale_deleted', entityType: 'sale', entityId: id,
      payload: { reason: reason ?? null, total: sale.total, deletedBy: request.user.id },
    })

    return { ok: true }
  })

  // POST /api/admin/sales/:id/request-delete — cashier requests deletion (goes to approval)
  app.post('/api/admin/sales/:id/request-delete', { preHandler: requirePermission('sales.delete') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { reason } = request.body as { reason?: string } || {}

    const sale = await db.query.sales.findFirst({
      where: (s, { eq, and }) => and(eq(s.id, id), eq(s.tenantId, request.tenant.id)),
    })
    if (!sale) return reply.code(404).send({ error: 'Sale not found' })
    if (sale.status !== 'approved') return reply.code(400).send({ error: 'Only approved sales can be requested for deletion' })

    // Mark as pending_delete
    await db.update(sales).set({ status: 'pending_delete' as any }).where(eq(sales.id, id))

    // Audit log
    await db.insert(auditLog).values({
      tenantId: request.tenant.id, userId: request.user.id,
      eventType: 'sale_delete_requested', entityType: 'sale', entityId: id,
      payload: { reason: reason ?? null, requestedBy: request.user.id },
    })

    return { ok: true, message: 'Delete request sent for approval' }
  })
}
