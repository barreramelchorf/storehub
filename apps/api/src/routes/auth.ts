import type { FastifyInstance } from 'fastify'
import { db, users, roles } from '@storehub/db'
import bcrypt from 'bcryptjs'
import { loginSchema } from '@storehub/schemas'
import { signTokens, verifyToken } from '../plugins/jwt.js'

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    const { email, password } = body.data
    const tenantId = request.tenant.id

    const user = await db.query.users.findFirst({
      where: (u, { eq, and }) => and(eq(u.email, email), eq(u.tenantId, tenantId), eq(u.active, true)),
      with: { role: { columns: { permissions: true } } },
    })

    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const permissions = (user as any).role.permissions as string[]
    const { accessToken, refreshToken } = await signTokens({ userId: user.id, tenantId, permissions })

    reply.setCookie('refreshToken', refreshToken, {
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
