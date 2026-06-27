import type { FastifyRequest, FastifyReply } from 'fastify'

export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user?.permissions.includes(permission)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
  }
}
