import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, tenants } from '@storehub/db'

declare module 'fastify' {
  interface FastifyRequest {
    tenant: typeof tenants.$inferSelect
  }
}

export async function resolveTenant(request: FastifyRequest, reply: FastifyReply) {
  const rawHost = (request.headers['x-forwarded-host'] as string) ?? request.hostname
  const host = rawHost.toLowerCase().split(':')[0]
  const platformDomain = process.env.PLATFORM_DOMAIN ?? 'localhost'

  const slug = host.endsWith(`.${platformDomain}`)
    ? host.slice(0, host.length - platformDomain.length - 1)
    : null

  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => slug ? eq(t.slug, slug) : eq(t.customDomain, host),
  })

  if (!tenant) return reply.code(404).send({ error: 'Tenant not found' })

  request.tenant = tenant
}
