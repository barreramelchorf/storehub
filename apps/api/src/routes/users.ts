import type { FastifyInstance } from 'fastify'
import { db, users, roles } from '@storehub/db'
import bcrypt from 'bcryptjs'
import { createUserSchema } from '@storehub/schemas'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/api/admin/users', { preHandler: requirePermission('users.manage') }, async (request) => {
    return db.query.users.findMany({
      where: (u, { eq }) => eq(u.tenantId, request.tenant.id),
      columns: { id: true, email: true, roleId: true, active: true, createdAt: true, tenantId: true },
    })
  })

  app.get('/api/admin/roles', { preHandler: requirePermission('users.manage') }, async (request) => {
    return db.query.roles.findMany({ where: (r, { eq }) => eq(r.tenantId, request.tenant.id) })
  })

  app.post('/api/admin/users', { preHandler: requirePermission('users.manage') }, async (request, reply) => {
    const body = createUserSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const passwordHash = await bcrypt.hash(body.data.password, 10)
    const [user] = await db.insert(users).values({ tenantId: request.tenant.id, email: body.data.email, passwordHash, roleId: body.data.roleId }).returning()
    return reply.code(201).send({ id: user.id, email: user.email, roleId: user.roleId, active: user.active })
  })
}
