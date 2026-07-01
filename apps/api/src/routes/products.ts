import type { FastifyInstance } from 'fastify'
import { db, products } from '@storehub/db'
import { eq, and, asc, sql } from 'drizzle-orm'
import { productSchema } from '@storehub/schemas'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

export async function productRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/api/admin/products', { preHandler: requirePermission('inventory.view') }, async (request) => {
    const { page = '1', pageSize = '20', category, search } = request.query as Record<string, string>
    const limit = Math.min(Number(pageSize), 500)
    const offset = (Number(page) - 1) * limit

    const items = await db.query.products.findMany({
      where: (p, { eq, and }) => {
        const conditions = [eq(p.tenantId, request.tenant.id)]
        if (category) conditions.push(eq(p.categoryId, category))
        if (search) conditions.push(sql`unaccent(${p.name}) ILIKE unaccent(${`%${search}%`})`)
        return and(...conditions)
      },
      limit, offset, orderBy: (p) => [asc(p.name)]
    })
    return { items, page: Number(page), pageSize: limit }
  })

  app.post('/api/admin/products', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const body = productSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const [product] = await db.insert(products).values({ ...body.data, tenantId: request.tenant.id, price: String(body.data.price) }).returning()
    return reply.code(201).send(product)
  })

  app.get('/api/admin/products/:id', { preHandler: requirePermission('inventory.view') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const product = await db.query.products.findFirst({ where: (p, { eq, and }) => and(eq(p.id, id), eq(p.tenantId, request.tenant.id)) })
    if (!product) return reply.code(404).send({ error: 'Not found' })
    return product
  })

  app.put('/api/admin/products/:id', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = productSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const { price, ...rest } = body.data; const values: Record<string, any> = { ...rest }; if (price !== undefined) values.price = String(price)
    const [updated] = await db.update(products).set(values).where(and(eq(products.id, id), eq(products.tenantId, request.tenant.id))).returning()
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return updated
  })

  app.delete('/api/admin/products/:id', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [deleted] = await db.delete(products).where(and(eq(products.id, id), eq(products.tenantId, request.tenant.id))).returning()
    if (!deleted) return reply.code(404).send({ error: 'Not found' })
    return { ok: true }
  })
}
