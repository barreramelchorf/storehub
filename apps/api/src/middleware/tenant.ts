import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, tenants } from '@storehub/db'

declare module 'fastify' {
  interface FastifyRequest {
    tenant: typeof tenants.$inferSelect
  }
}

export async function resolveTenant(request: FastifyRequest, reply: FastifyReply) {
  // x-tenant-slug is always accepted (needed for /t/:slug public pages server-side rendering)
  // Security is enforced by JWT on admin routes, not by tenant resolution
  const tenantSlug = request.headers['x-tenant-slug'] as string | undefined

  const rawHost = (request.headers['x-forwarded-host'] as string) ?? request.hostname
  const host = rawHost.toLowerCase().split(':')[0]
  const platformDomain = process.env.PLATFORM_DOMAIN ?? 'localhost'

  let slug = tenantSlug ?? null

  if (!slug && host.endsWith(`.${platformDomain}`)) {
    slug = host.slice(0, host.length - platformDomain.length - 1)
  }

  let tenant
  if (slug) {
    tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.slug, slug!) })
  }
  if (!tenant) {
    tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.customDomain, host) })
  }
  if (!tenant && process.env.DEFAULT_TENANT_SLUG) {
    tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.slug, process.env.DEFAULT_TENANT_SLUG!) })
  }

  if (!tenant) return reply.code(404).send({ error: 'Tenant not found' })
  request.tenant = tenant
}
