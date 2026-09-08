import type { FastifyInstance } from 'fastify'
import { db, campaigns, campaignProducts, campaignCategories } from '@storehub/db'
import { eq, and } from 'drizzle-orm'
import { campaignSchema } from '@storehub/schemas'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

export async function campaignRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // List all campaigns with their product/category links
  app.get('/api/admin/campaigns', { preHandler: requirePermission('inventory.manage') }, async (request) => {
    return db.query.campaigns.findMany({
      where: (c, { eq }) => eq(c.tenantId, request.tenant.id),
      with: { productLinks: true, categoryLinks: true },
      orderBy: (c, { desc }) => [desc(c.priority), desc(c.createdAt)],
    })
  })

  // Create a campaign (with product/category assignments)
  app.post('/api/admin/campaigns', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const parsed = campaignSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues.map(i => i.message).join(', ') })

    const { name, type, config, daysOfWeek, active, priority, productIds, categoryIds } = parsed.data

    const [campaign] = await db.insert(campaigns).values({
      tenantId: request.tenant.id,
      name, type, config, daysOfWeek, active, priority,
    }).returning()

    if (productIds.length > 0) {
      await db.insert(campaignProducts).values(productIds.map(productId => ({ campaignId: campaign.id, productId }))).onConflictDoNothing()
    }
    if (categoryIds.length > 0) {
      await db.insert(campaignCategories).values(categoryIds.map(categoryId => ({ campaignId: campaign.id, categoryId }))).onConflictDoNothing()
    }

    return reply.code(201).send(campaign)
  })

  // Update a campaign (replaces assignments)
  app.put('/api/admin/campaigns/:id', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = campaignSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues.map(i => i.message).join(', ') })

    const { name, type, config, daysOfWeek, active, priority, productIds, categoryIds } = parsed.data

    const [updated] = await db.update(campaigns)
      .set({ name, type, config, daysOfWeek, active, priority })
      .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, request.tenant.id)))
      .returning()
    if (!updated) return reply.code(404).send({ error: 'Not found' })

    // Replace assignments
    await db.delete(campaignProducts).where(eq(campaignProducts.campaignId, id))
    await db.delete(campaignCategories).where(eq(campaignCategories.campaignId, id))
    if (productIds.length > 0) {
      await db.insert(campaignProducts).values(productIds.map(productId => ({ campaignId: id, productId }))).onConflictDoNothing()
    }
    if (categoryIds.length > 0) {
      await db.insert(campaignCategories).values(categoryIds.map(categoryId => ({ campaignId: id, categoryId }))).onConflictDoNothing()
    }

    return updated
  })

  // Delete a campaign
  app.delete('/api/admin/campaigns/:id', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [deleted] = await db.delete(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, request.tenant.id)))
      .returning()
    if (!deleted) return reply.code(404).send({ error: 'Not found' })
    return { ok: true }
  })
}
