import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, tenants } from '@storehub/db'
import { eq } from 'drizzle-orm'

declare module 'fastify' {
  interface FastifyRequest {
    tenant: typeof tenants.$inferSelect
  }
}

export async function resolveTenant(request: FastifyRequest, reply: FastifyReply) {
  const host = request.hostname.toLowerCase()
  const platformDomain = process.env.PLATFORM_DOMAIN ?? 'localhost'

  const slug = host.endsWith(`.${platformDomain}`)
    ? host.slice(0, host.length - platformDomain.length - 1)
    : null

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(slug ? eq(tenants.slug, slug) : eq(tenants.customDomain, host))
    .limit(1)

  if (!tenant) return reply.code(404).send({ error: 'Tenant not found' })

  await db.execute(`SET LOCAL app.tenant_id = '${tenant.id}'`)
  request.tenant = tenant
}
