import type { FastifyInstance } from 'fastify'
import { db, users, roles } from '@storehub/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { loginSchema, passwordSchema } from '@storehub/schemas'
import { signTokens, verifyToken } from '../plugins/jwt.js'

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const { email, password, username } = request.body as { email?: string; password: string; username?: string }
    if (!password || (!email && !username)) return reply.code(400).send({ error: 'Email/username and password required' })

    const tenantId = request.tenant.id

    const user = await db.query.users.findFirst({
      where: (u, { eq, and, or }) => and(
        eq(u.tenantId, tenantId),
        eq(u.active, true),
        email ? eq(u.email, email) : eq(u.username, username!),
      ),
      with: { role: { columns: { permissions: true } } },
    })

    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const permissions = (user as any).role.permissions as string[]
    const { accessToken, refreshToken } = await signTokens({ userId: user.id, tenantId, permissions, mustChangePassword: user.mustChangePassword })

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/auth',
    })
    return { accessToken, mustChangePassword: user.mustChangePassword }
  })

  app.post('/api/auth/change-password', async (request, reply) => {
    const { newPassword } = request.body as { newPassword: string }
    if (!newPassword) return reply.code(400).send({ error: 'newPassword required' })

    const passwordResult = passwordSchema.safeParse(newPassword)
    if (!passwordResult.success) return reply.code(400).send({ error: passwordResult.error.errors[0].message })

    // Get user from refresh token cookie
    const token = (request.cookies as Record<string, string>)?.refreshToken
    if (!token) return reply.code(401).send({ error: 'Unauthorized' })

    let payload: any
    try { payload = await verifyToken(token) } catch { return reply.code(401).send({ error: 'Unauthorized' }) }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await db.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, payload.userId))

    // Re-issue tokens with mustChangePassword = false
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, payload.userId),
      with: { role: { columns: { permissions: true } } },
    })
    if (!user) return reply.code(401).send({ error: 'Unauthorized' })

    const permissions = (user as any).role.permissions as string[]
    const { accessToken, refreshToken: newRefreshToken } = await signTokens({ userId: user.id, tenantId: payload.tenantId, permissions, mustChangePassword: false })

    reply.setCookie('refreshToken', newRefreshToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/auth',
    })
    return { accessToken }
  })

  app.post('/api/auth/refresh', async (request, reply) => {
    const token = (request.cookies as Record<string, string>)?.refreshToken
    if (!token) return reply.code(401).send({ error: 'Unauthorized' })

    try {
      const payload = await verifyToken(token)
      const user = await db.query.users.findFirst({
        where: (u, { eq, and }) => and(eq(u.id, payload.userId), eq(u.active, true)),
        with: { role: { columns: { permissions: true } } },
      })
      if (!user) return reply.code(401).send({ error: 'Unauthorized' })

      const { accessToken } = await signTokens({
        userId: payload.userId,
        tenantId: payload.tenantId,
        permissions: (user as any).role.permissions as string[],
        mustChangePassword: user.mustChangePassword,
      })
      return { accessToken }
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    reply.clearCookie('refreshToken', { path: '/api/auth' })
    return { ok: true }
  })
}
