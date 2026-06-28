import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, tenants } from '@storehub/db'

declare module 'fastify' {
  interface FastifyRequest {
    tenant: typeof tenants.$inferSelect
  }
}

export async function resolveTenant(request: FastifyRequest, reply: FastifyReply) {
  const allowSlugOverride = process.env.NODE_ENV !== 'production'
  const tenantSlug = allowSlugOverride ? (request.headers['x-tenant-slug'] as string | undefined) : undefined

  const rawHost = (request.headers['x-forwarded-host'] as string) ?? request.hostname
  const host = rawHost.toLowerCase().split(':')[0]
  const platformDomain = process.env.PLATFORM_DOMAIN ?? 'localhost'

  // 1. Dev override
  // 2. Extract slug from subdomain
  // 3. Look up by custom_domain
  // 4. Fall back to DEFAULT_TENANT_SLUG
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
