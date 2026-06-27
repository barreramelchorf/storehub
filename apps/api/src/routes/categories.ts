import type { FastifyInstance } from 'fastify'
import { db, categories } from '@storehub/db'
import { eq, and, asc } from 'drizzle-orm'
import { categorySchema } from '@storehub/schemas'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

export async function categoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/api/admin/categories', { preHandler: requirePermission('inventory.view') }, async (request) => {
    return db.query.categories.findMany({
      where: (c, { eq }) => eq(c.tenantId, request.tenant.id),
      orderBy: (c) => [asc(c.sortOrder)],
    })
  })

  app.post('/api/admin/categories', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const body = categorySchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const [cat] = await db.insert(categories).values({ ...body.data, tenantId: request.tenant.id }).returning()
    return reply.code(201).send(cat)
  })

  app.put('/api/admin/categories/:id', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = categorySchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const [updated] = await db.update(categories).set(body.data).where(and(eq(categories.id, id), eq(categories.tenantId, request.tenant.id))).returning()
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return updated
  })

  app.delete('/api/admin/categories/:id', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [deleted] = await db.delete(categories).where(and(eq(categories.id, id), eq(categories.tenantId, request.tenant.id))).returning()
    if (!deleted) return reply.code(404).send({ error: 'Not found' })
    return { ok: true }
  })
}
