import type { FastifyInstance } from 'fastify'
import { db } from '@storehub/db'
import { asc } from 'drizzle-orm'

export async function publicRoutes(app: FastifyInstance) {
  app.get('/api/public/products', async (request) => {
    const { category, search, page = '1', pageSize = '20' } = request.query as Record<string, string>
    const tenantId = request.tenant.id
    const limit = Math.min(Number(pageSize), 100)
    const offset = (Number(page) - 1) * limit

    const items = await db.query.products.findMany({
      where: (p, { eq, and, ilike }) => {
        const conditions = [eq(p.tenantId, tenantId), eq(p.active, true), eq(p.visible, true)]
        if (category) conditions.push(eq(p.categoryId, category))
        if (search) conditions.push(ilike(p.name, `%${search}%`))
        return and(...conditions)
      },
      limit, offset, orderBy: (p) => [asc(p.name)],
    })
    return { items, page: Number(page), pageSize: limit }
  })

  app.get('/api/public/info', async (request) => {
    const t = request.tenant
    return { name: t.name, giro: t.giro, config: t.config }
  })

  app.get('/api/public/categories', async (request) => {
    return db.query.categories.findMany({
      where: (c, { eq, and }) => and(eq(c.tenantId, request.tenant.id), eq(c.active, true)),
      orderBy: (c) => [asc(c.sortOrder)],
    })
  })

  app.get('/:slug.pdf', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const doc = await db.query.documents.findFirst({
      where: (d, { eq, and }) => and(eq(d.tenantId, request.tenant.id), eq(d.slug, slug), eq(d.active, true)),
    })
    if (!doc) return reply.code(404).send({ error: 'Document not found' })
    // TODO: Return presigned MinIO URL or redirect
    return reply.redirect(`/storage/${doc.filePath}`)
  })
}
