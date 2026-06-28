import type { FastifyInstance } from 'fastify'
import { db, tenants } from '@storehub/db'
import { eq } from 'drizzle-orm'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/api/admin/settings', { preHandler: requirePermission('settings.manage') }, async (request) => {
    return request.tenant
  })

  app.put('/api/admin/settings', { preHandler: requirePermission('settings.manage') }, async (request, reply) => {
    const { name, config } = request.body as { name?: string; config?: any }
    const updates: any = {}
    if (name) updates.name = name
    if (config) updates.config = config

    const [updated] = await db.update(tenants).set(updates).where(eq(tenants.id, request.tenant.id)).returning()
    return updated
  })
}
