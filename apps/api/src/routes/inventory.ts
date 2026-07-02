import type { FastifyInstance } from 'fastify'
import { db, products, auditLog } from '@storehub/db'
import { eq, and, sql } from 'drizzle-orm'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

export async function inventoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // POST /api/admin/inventory/restock — only adds stock, never subtracts
  app.post('/api/admin/inventory/restock', { preHandler: requirePermission('inventory.restock') }, async (request, reply) => {
    const { items } = request.body as { items: Array<{ productId: string; quantity: number; reason?: string }> }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({ error: 'items array is required and must not be empty' })
    }

    // Validate all items
    for (const item of items) {
      if (!item.productId || typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        return reply.code(400).send({ error: 'Each item must have a productId and a positive integer quantity' })
      }
    }

    const results: Array<{ productId: string; previousStock: number; newStock: number; quantity: number }> = []

    for (const item of items) {
      // Verify the product exists and belongs to this tenant
      const product = await db.query.products.findFirst({
        where: (p, { eq, and }) => and(eq(p.id, item.productId), eq(p.tenantId, request.tenant.id)),
      })

      if (!product) {
        return reply.code(404).send({ error: `Product ${item.productId} not found` })
      }

      const previousStock = product.stock

      // Only add stock — never subtract
      const [updated] = await db.update(products)
        .set({ stock: sql`${products.stock} + ${item.quantity}` })
        .where(and(eq(products.id, item.productId), eq(products.tenantId, request.tenant.id)))
        .returning()

      results.push({
        productId: item.productId,
        previousStock,
        newStock: updated.stock,
        quantity: item.quantity,
      })

      // Audit log for every restock operation
      await db.insert(auditLog).values({
        tenantId: request.tenant.id,
        userId: request.user.id,
        eventType: 'inventory_restock',
        entityType: 'product',
        entityId: item.productId,
        payload: {
          productName: product.name,
          previousStock,
          addedQuantity: item.quantity,
          newStock: updated.stock,
          reason: item.reason ?? null,
        },
      })
    }

    return reply.code(200).send({ ok: true, results })
  })
}
