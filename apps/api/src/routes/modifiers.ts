import type { FastifyInstance } from 'fastify'
import { db, modifierGroups, modifierOptions, productModifierGroups, categoryModifierGroups } from '@storehub/db'
import { eq, and } from 'drizzle-orm'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

export async function modifierRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // List all modifier groups with their options (for admin)
  app.get('/api/admin/modifiers', { preHandler: requirePermission('inventory.manage') }, async (request) => {
    return db.query.modifierGroups.findMany({
      where: (g, { eq }) => eq(g.tenantId, request.tenant.id),
      with: { options: true, productLinks: true },
      orderBy: (g, { asc }) => [asc(g.name)],
    })
  })

  // Create a modifier group
  app.post('/api/admin/modifiers', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { name, required, multiple } = request.body as { name: string; required?: boolean; multiple?: boolean }
    if (!name) return reply.code(400).send({ error: 'name is required' })

    const [group] = await db.insert(modifierGroups).values({
      tenantId: request.tenant.id,
      name,
      required: required ?? false,
      multiple: multiple ?? true,
    }).returning()

    return reply.code(201).send(group)
  })

  // Update a modifier group
  app.put('/api/admin/modifiers/:id', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { name, required, multiple, active } = request.body as any
    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (required !== undefined) updates.required = required
    if (multiple !== undefined) updates.multiple = multiple
    if (active !== undefined) updates.active = active

    const [updated] = await db.update(modifierGroups)
      .set(updates)
      .where(and(eq(modifierGroups.id, id), eq(modifierGroups.tenantId, request.tenant.id)))
      .returning()
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return updated
  })

  // Delete a modifier group
  app.delete('/api/admin/modifiers/:id', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [deleted] = await db.delete(modifierGroups)
      .where(and(eq(modifierGroups.id, id), eq(modifierGroups.tenantId, request.tenant.id)))
      .returning()
    if (!deleted) return reply.code(404).send({ error: 'Not found' })
    return { ok: true }
  })

  // Add option to a group
  app.post('/api/admin/modifiers/:groupId/options', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { groupId } = request.params as { groupId: string }
    const { name, price } = request.body as { name: string; price?: number }
    if (!name) return reply.code(400).send({ error: 'name is required' })

    // Verify group belongs to tenant
    const group = await db.query.modifierGroups.findFirst({
      where: (g, { eq, and }) => and(eq(g.id, groupId), eq(g.tenantId, request.tenant.id)),
    })
    if (!group) return reply.code(404).send({ error: 'Group not found' })

    const [option] = await db.insert(modifierOptions).values({
      groupId,
      name,
      price: String(price ?? 0),
    }).returning()

    return reply.code(201).send(option)
  })

  // Update an option
  app.put('/api/admin/modifiers/options/:id', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { name, price, active, sortOrder } = request.body as any
    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (price !== undefined) updates.price = String(price)
    if (active !== undefined) updates.active = active
    if (sortOrder !== undefined) updates.sortOrder = sortOrder

    const [updated] = await db.update(modifierOptions).set(updates).where(eq(modifierOptions.id, id)).returning()
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return updated
  })

  // Delete an option
  app.delete('/api/admin/modifiers/options/:id', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [deleted] = await db.delete(modifierOptions).where(eq(modifierOptions.id, id)).returning()
    if (!deleted) return reply.code(404).send({ error: 'Not found' })
    return { ok: true }
  })

  // Assign modifier group to a product
  app.post('/api/admin/modifiers/:groupId/assign', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { groupId } = request.params as { groupId: string }
    const { productIds } = request.body as { productIds: string[] }
    if (!productIds?.length) return reply.code(400).send({ error: 'productIds required' })

    // Verify group belongs to tenant
    const group = await db.query.modifierGroups.findFirst({
      where: (g, { eq, and }) => and(eq(g.id, groupId), eq(g.tenantId, request.tenant.id)),
    })
    if (!group) return reply.code(404).send({ error: 'Group not found' })

    // Insert links (ignore duplicates)
    for (const productId of productIds) {
      await db.insert(productModifierGroups)
        .values({ productId, groupId })
        .onConflictDoNothing()
    }

    return { ok: true, assigned: productIds.length }
  })

  // Remove modifier group from a product
  app.delete('/api/admin/modifiers/:groupId/assign/:productId', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { groupId, productId } = request.params as { groupId: string; productId: string }
    await db.delete(productModifierGroups)
      .where(and(eq(productModifierGroups.groupId, groupId), eq(productModifierGroups.productId, productId)))
    return { ok: true }
  })

  // Get modifiers for a specific product (used by POS)
  // Includes both product-level AND category-level modifiers
  app.get('/api/admin/products/:productId/modifiers', async (request) => {
    const { productId } = request.params as { productId: string }

    // Get product to find its category
    const product = await db.query.products.findFirst({
      where: (p, { eq }) => eq(p.id, productId),
      columns: { categoryId: true },
    })

    // Get product-level modifiers
    const productLinks = await db.query.productModifierGroups.findMany({
      where: (pmg, { eq }) => eq(pmg.productId, productId),
      with: { group: { with: { options: true } } },
    })

    // Get category-level modifiers
    const categoryLinks = product ? await db.query.categoryModifierGroups.findMany({
      where: (cmg, { eq }) => eq(cmg.categoryId, product.categoryId),
      with: { group: { with: { options: true } } },
    }) : []

    // Merge and deduplicate by group id
    const allLinks = [...productLinks, ...categoryLinks]
    const seen = new Set<string>()
    const unique = allLinks.filter(l => {
      if (seen.has(l.group.id)) return false
      seen.add(l.group.id)
      return true
    })

    return unique
      .filter(l => l.group.active)
      .map(l => ({
        ...l.group,
        options: l.group.options.filter(o => o.active).sort((a, b) => a.sortOrder - b.sortOrder),
      }))
  })

  // Assign modifier group to a category
  app.post('/api/admin/modifiers/:groupId/assign-category', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { groupId } = request.params as { groupId: string }
    const { categoryIds } = request.body as { categoryIds: string[] }
    if (!categoryIds?.length) return reply.code(400).send({ error: 'categoryIds required' })

    const group = await db.query.modifierGroups.findFirst({
      where: (g, { eq, and }) => and(eq(g.id, groupId), eq(g.tenantId, request.tenant.id)),
    })
    if (!group) return reply.code(404).send({ error: 'Group not found' })

    for (const categoryId of categoryIds) {
      await db.insert(categoryModifierGroups).values({ categoryId, groupId }).onConflictDoNothing()
    }
    return { ok: true, assigned: categoryIds.length }
  })

  // Remove modifier group from a category
  app.delete('/api/admin/modifiers/:groupId/assign-category/:categoryId', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { groupId, categoryId } = request.params as { groupId: string; categoryId: string }
    await db.delete(categoryModifierGroups)
      .where(and(eq(categoryModifierGroups.groupId, groupId), eq(categoryModifierGroups.categoryId, categoryId)))
    return { ok: true }
  })

  // Get modifiers for a category
  app.get('/api/admin/categories/:categoryId/modifiers', async (request) => {
    const { categoryId } = request.params as { categoryId: string }
    const links = await db.query.categoryModifierGroups.findMany({
      where: (cmg, { eq }) => eq(cmg.categoryId, categoryId),
      columns: { groupId: true },
    })
    return links.map(l => l.groupId)
  })
}
