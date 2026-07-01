import type { FastifyInstance } from 'fastify'
import { db, tenants, roles, users } from "@storehub/db"
import { eq } from "drizzle-orm"
import bcrypt from 'bcryptjs'

export async function platformRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    const key = request.headers['x-platform-key']
    if (!key || key !== process.env.PLATFORM_API_KEY) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  app.post('/api/platform/tenants', async (request, reply) => {
    const { name, slug, giro, adminEmail, adminPassword, config } = request.body as any
    if (!name || !slug || !adminEmail || !adminPassword) {
      return reply.code(400).send({ error: 'name, slug, adminEmail, adminPassword required' })
    }

    const [tenant] = await db.insert(tenants).values({
      name, slug, giro: giro ?? 'other', config: config ?? {
        branding: { primaryColor: '#635BFF', secondaryColor: '#0A2540' },
        contact: {}, social: {},
        modules: { pos: true, inventory: true, analytics: true },
        meta: { title: name },
      },
    }).returning()

    const [adminRole] = await db.insert(roles).values({
      tenantId: tenant.id, name: 'admin', isDefault: true,
      permissions: ['sales.create','sales.view','sales.override_price','sales.backdate','inventory.view','inventory.manage','analytics.view','audit.view','settings.manage','users.manage','documents.manage'],
    }).returning()

    await db.insert(roles).values({ tenantId: tenant.id, name: 'manager', isDefault: true, permissions: ['sales.create','sales.view','sales.override_price','sales.backdate','inventory.view','inventory.manage','analytics.view','audit.view','documents.manage'] })
    await db.insert(roles).values({ tenantId: tenant.id, name: 'cashier', isDefault: true, permissions: ['sales.create'] })

    const [admin] = await db.insert(users).values({
      tenantId: tenant.id, email: adminEmail, passwordHash: await bcrypt.hash(adminPassword, 10), roleId: adminRole.id,
    }).returning()

    return reply.code(201).send({ tenant, admin: { id: admin.id, email: admin.email } })
  })

  app.get('/api/platform/tenants', async () => {
    return db.query.tenants.findMany({ columns: { id: true, slug: true, name: true, giro: true, customDomain: true, createdAt: true } })
  })

  app.put('/api/platform/tenants/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { name, customDomain, giro } = request.body as any
    const updates: any = {}
    if (name) updates.name = name
    if (customDomain !== undefined) updates.customDomain = customDomain || null
    if (giro) updates.giro = giro

    const [updated] = await db.update(tenants).set(updates).where(eq(tenants.id, id)).returning()
    if (!updated) return reply.code(404).send({ error: 'Tenant not found' })
    return updated
  })
}
