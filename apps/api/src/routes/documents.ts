import type { FastifyInstance } from 'fastify'
import { db, documents } from '@storehub/db'
import { eq, and } from 'drizzle-orm'
import { documentSchema } from '@storehub/schemas'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

export async function documentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/api/admin/documents', { preHandler: requirePermission('documents.manage') }, async (request) => {
    return db.query.documents.findMany({ where: (d, { eq }) => eq(d.tenantId, request.tenant.id) })
  })

  app.post('/api/admin/documents', { preHandler: requirePermission('documents.manage') }, async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'File required' })

    const meta = documentSchema.safeParse({ name: data.fields?.name?.toString() ?? data.filename, slug: data.fields?.slug?.toString(), active: true })
    if (!meta.success) return reply.code(400).send({ error: meta.error.flatten() })

    // Check slug uniqueness
    const existing = await db.query.documents.findFirst({ where: (d, { eq, and }) => and(eq(d.tenantId, request.tenant.id), eq(d.slug, meta.data.slug)) })
    if (existing) return reply.code(409).send({ error: 'Slug already exists' })

    // TODO: Upload to MinIO in phase 5
    const filePath = `tenants/${request.tenant.id}/docs/${meta.data.slug}.pdf`

    const [doc] = await db.insert(documents).values({ ...meta.data, tenantId: request.tenant.id, filePath }).returning()
    return reply.code(201).send(doc)
  })

  app.put('/api/admin/documents/:id', { preHandler: requirePermission('documents.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = documentSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const [updated] = await db.update(documents).set(body.data).where(and(eq(documents.id, id), eq(documents.tenantId, request.tenant.id))).returning()
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return updated
  })

  app.delete('/api/admin/documents/:id', { preHandler: requirePermission('documents.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [deleted] = await db.delete(documents).where(and(eq(documents.id, id), eq(documents.tenantId, request.tenant.id))).returning()
    if (!deleted) return reply.code(404).send({ error: 'Not found' })
    return { ok: true }
  })
}
