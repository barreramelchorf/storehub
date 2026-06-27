import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, users, roles } from '@storehub/db'
import { verifyToken } from '../plugins/jwt.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; tenantId: string; email: string; permissions: string[] }
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) return reply.code(401).send({ error: 'Unauthorized' })

  try {
    const payload = await verifyToken(auth.slice(7))

    const result = await db.query.users.findFirst({
      where: (u, { eq, and }) => and(eq(u.id, payload.userId), eq(u.active, true)),
      with: { role: { columns: { permissions: true } } },
      columns: { id: true, tenantId: true, email: true },
    })

    if (!result) return reply.code(401).send({ error: 'Unauthorized' })

    request.user = {
      id: result.id,
      tenantId: result.tenantId,
      email: result.email,
      permissions: (result as any).role.permissions as string[],
    }
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
}
