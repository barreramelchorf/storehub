import type { FastifyInstance } from 'fastify'
import { db, users, roles } from '@storehub/db'
import { eq, and } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { passwordSchema } from '@storehub/schemas'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'
import { sendWelcomeEmail } from '../lib/email.js'

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/api/admin/users', { preHandler: requirePermission('users.manage') }, async (request) => {
    return db.query.users.findMany({
      where: (u, { eq }) => eq(u.tenantId, request.tenant.id),
      columns: { id: true, email: true, username: true, roleId: true, active: true, createdAt: true, tenantId: true },
    })
  })

  app.get('/api/admin/roles', { preHandler: requirePermission('users.manage') }, async (request) => {
    return db.query.roles.findMany({ where: (r, { eq }) => eq(r.tenantId, request.tenant.id) })
  })

  app.post('/api/admin/users', { preHandler: requirePermission('users.manage') }, async (request, reply) => {
    const { email, username, password, roleId } = request.body as any
    if (!email || !password || !roleId) return reply.code(400).send({ error: 'email, password, roleId required' })

    const passwordResult = passwordSchema.safeParse(password)
    if (!passwordResult.success) return reply.code(400).send({ error: passwordResult.error.errors[0].message })

    const passwordHash = await bcrypt.hash(password, 10)
    const [user] = await db.insert(users).values({ tenantId: request.tenant.id, email, username: username || null, passwordHash, roleId, mustChangePassword: true }).returning()

    // Send welcome email (non-blocking)
    const tenantName = request.tenant.name
    const host = request.headers['x-forwarded-host'] ?? request.headers.host ?? ''
    const protocol = 'https'
    const isCustomDomain = !String(host).includes('/t/')
    const loginUrl = isCustomDomain && request.tenant.customDomain
      ? `${protocol}://${request.tenant.customDomain}/admin/login`
      : `${protocol}://${host}/t/${request.tenant.slug}/admin/login`

    sendWelcomeEmail({
      to: email,
      username: username || email,
      password,
      tenantName,
      loginUrl,
      createdBy: request.user.email,
    }).catch(() => {}) // fire and forget

    return reply.code(201).send({ id: user.id, email: user.email, username: user.username, roleId: user.roleId, active: user.active })
  })

  app.put('/api/admin/users/:id', { preHandler: requirePermission('users.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { email, username, password, roleId, mustChangePassword } = request.body as any
    const updates: any = {}
    if (email) updates.email = email
    if (username !== undefined) updates.username = username || null
    if (roleId) updates.roleId = roleId
    if (mustChangePassword !== undefined) updates.mustChangePassword = mustChangePassword
    if (password) {
      const passwordResult = passwordSchema.safeParse(password)
      if (!passwordResult.success) return reply.code(400).send({ error: passwordResult.error.errors[0].message })
      updates.passwordHash = await bcrypt.hash(password, 10)
    }

    const [updated] = await db.update(users).set(updates).where(and(eq(users.id, id), eq(users.tenantId, request.tenant.id))).returning()
    if (!updated) return reply.code(404).send({ error: 'User not found' })
    return { id: updated.id, email: updated.email, username: updated.username, roleId: updated.roleId, active: updated.active }
  })

  app.delete('/api/admin/users/:id', { preHandler: requirePermission('users.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [deleted] = await db.update(users).set({ active: false }).where(and(eq(users.id, id), eq(users.tenantId, request.tenant.id))).returning()
    if (!deleted) return reply.code(404).send({ error: 'User not found' })
    return { ok: true }
  })
}
