import type { FastifyInstance } from 'fastify'
import { db } from '@storehub/db'
import { desc } from 'drizzle-orm'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

export async function auditRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/api/admin/audit', { preHandler: requirePermission('audit.view') }, async (request) => {
    const { eventType } = request.query as { eventType?: string }
    return db.query.auditLog.findMany({
      where: (a, { eq, and }) => {
        const conditions = [eq(a.tenantId, request.tenant.id)]
        if (eventType) conditions.push(eq(a.eventType, eventType))
        return and(...conditions)
      },
      orderBy: (a) => [desc(a.createdAt)],
      limit: 100,
    })
  })
}
