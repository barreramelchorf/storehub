/**
 * Admin loyalty routes (JWT auth + permissions). Tenant-scoped.
 *  - GET|PUT  /api/admin/loyalty/program            loyalty.manage
 *  - GET      /api/admin/loyalty/cards              loyalty.manage
 *  - GET      /api/admin/loyalty/cards/:id          loyalty.manage
 *  - POST     /api/admin/loyalty/scan               loyalty.scan
 *  - POST     /api/admin/loyalty/cards/:id/redeem   loyalty.scan
 *  - POST     /api/admin/loyalty/cards/:id/adjust   loyalty.manage
 *  - GET|POST /api/admin/loyalty/campaigns          loyalty.manage
 *  - GET      /api/admin/loyalty/campaigns/:id      loyalty.manage
 */
import type { FastifyInstance } from 'fastify'
import { db, loyaltyPrograms, loyaltyCards, loyaltyTransactions, loyaltyCampaigns } from '@storehub/db'
import { eq, and, sql } from 'drizzle-orm'
import { loyaltyProgramSchema, loyaltyScanSchema, loyaltyAdjustSchema, loyaltyCampaignSchema } from '@storehub/schemas'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'
import { canEarnToday, hasReachedReward, pointsToReward } from '../lib/loyalty/scan-logic.js'
import { pushDispatcher } from '../lib/loyalty/push-dispatcher.js'

export async function loyaltyAdminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ─── Programs (CRUD) ───────────────────────────────────────────────────────
  // List all programs of the tenant.
  app.get('/api/admin/loyalty/programs', { preHandler: requirePermission('loyalty.manage') }, async (request) => {
    return db.query.loyaltyPrograms.findMany({
      where: (p, { eq }) => eq(p.tenantId, request.tenant.id),
      orderBy: (p, { asc }) => [asc(p.createdAt)],
    })
  })

  // Create a program.
  app.post('/api/admin/loyalty/programs', { preHandler: requirePermission('loyalty.manage') }, async (request, reply) => {
    const parsed = loyaltyProgramSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' })
    const data = parsed.data

    // Multi-program is a separate add-on. Without it, a tenant may have at most
    // one program. Editing the existing one is always allowed (PUT); only
    // creating additional programs is gated.
    const modules = (request.tenant.config as any)?.modules ?? {}
    if (modules.loyaltyMultiProgram !== true) {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.tenantId, request.tenant.id))
      if ((count ?? 0) >= 1) {
        return reply.code(409).send({ error: 'Crear más de un programa requiere el add-on de múltiples programas.' })
      }
    }

    const [created] = await db.insert(loyaltyPrograms).values({
      tenantId: request.tenant.id,
      name: data.name,
      active: data.active,
      pointsPerVisit: data.pointsPerVisit,
      welcomePoints: data.welcomePoints,
      rewardThreshold: data.rewardThreshold ?? null,
      rewardDescription: data.rewardDescription ?? null,
      branding: data.branding,
    }).returning()
    return reply.code(201).send(created)
  })

  // Edit a program.
  app.put('/api/admin/loyalty/programs/:id', { preHandler: requirePermission('loyalty.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = loyaltyProgramSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' })
    const data = parsed.data
    const [updated] = await db.update(loyaltyPrograms).set({
      name: data.name,
      active: data.active,
      pointsPerVisit: data.pointsPerVisit,
      welcomePoints: data.welcomePoints,
      rewardThreshold: data.rewardThreshold ?? null,
      rewardDescription: data.rewardDescription ?? null,
      branding: data.branding,
    }).where(and(eq(loyaltyPrograms.id, id), eq(loyaltyPrograms.tenantId, request.tenant.id))).returning()
    if (!updated) return reply.code(404).send({ error: 'Programa no encontrado' })
    return updated
  })

  // Legacy singular endpoints (backward compat): GET returns the first program;
  // PUT upserts the first program (used before multi-program support existed).
  app.get('/api/admin/loyalty/program', { preHandler: requirePermission('loyalty.manage') }, async (request) => {
    const program = await db.query.loyaltyPrograms.findFirst({
      where: (p, { eq }) => eq(p.tenantId, request.tenant.id),
      orderBy: (p, { asc }) => [asc(p.createdAt)],
    })
    return program ?? null
  })

  app.put('/api/admin/loyalty/program', { preHandler: requirePermission('loyalty.manage') }, async (request, reply) => {
    const parsed = loyaltyProgramSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' })
    const tenantId = request.tenant.id
    const data = parsed.data

    const existing = await db.query.loyaltyPrograms.findFirst({
      where: (p, { eq }) => eq(p.tenantId, tenantId),
      orderBy: (p, { asc }) => [asc(p.createdAt)],
    })
    if (existing) {
      const [updated] = await db.update(loyaltyPrograms).set({
        name: data.name,
        active: data.active,
        pointsPerVisit: data.pointsPerVisit,
        welcomePoints: data.welcomePoints,
        rewardThreshold: data.rewardThreshold ?? null,
        rewardDescription: data.rewardDescription ?? null,
        branding: data.branding,
      }).where(eq(loyaltyPrograms.id, existing.id)).returning()
      return updated
    }
    const [created] = await db.insert(loyaltyPrograms).values({
      tenantId,
      name: data.name,
      active: data.active,
      pointsPerVisit: data.pointsPerVisit,
      welcomePoints: data.welcomePoints,
      rewardThreshold: data.rewardThreshold ?? null,
      rewardDescription: data.rewardDescription ?? null,
      branding: data.branding,
    }).returning()
    return reply.code(201).send(created)
  })

  // ─── Cards ───────────────────────────────────────────────────────────────
  app.get('/api/admin/loyalty/cards', { preHandler: requirePermission('loyalty.manage') }, async (request) => {
    const { page = '1', pageSize = '30', search } = request.query as Record<string, string>
    const limit = Math.min(Number(pageSize), 100)
    const offset = (Number(page) - 1) * limit
    const items = await db.query.loyaltyCards.findMany({
      where: (c, { eq, and, or, ilike }) => {
        const base = eq(c.tenantId, request.tenant.id)
        if (search) {
          return and(base, or(ilike(c.customerName, `%${search}%`), ilike(c.customerPhone, `%${search}%`), ilike(c.customerEmail, `%${search}%`)))
        }
        return base
      },
      orderBy: (c, { desc }) => [desc(c.createdAt)],
      limit, offset,
    })
    return { items, page: Number(page), pageSize: limit }
  })

  app.get('/api/admin/loyalty/cards/:id', { preHandler: requirePermission('loyalty.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const card = await db.query.loyaltyCards.findFirst({
      where: (c, { eq, and }) => and(eq(c.id, id), eq(c.tenantId, request.tenant.id)),
    })
    if (!card) return reply.code(404).send({ error: 'Tarjeta no encontrada' })
    const transactions = await db.query.loyaltyTransactions.findMany({
      where: (t, { eq }) => eq(t.cardId, id),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit: 50,
    })
    return { ...card, transactions }
  })

  // ─── Scan (check-in): +pointsPerVisit, once per business day ───────────────
  app.post('/api/admin/loyalty/scan', { preHandler: requirePermission('loyalty.scan') }, async (request, reply) => {
    const parsed = loyaltyScanSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'cardId inválido' })
    const tenantId = request.tenant.id

    const card = await db.query.loyaltyCards.findFirst({
      where: (c, { eq, and }) => and(eq(c.id, parsed.data.cardId), eq(c.tenantId, tenantId)),
    })
    if (!card) return reply.code(404).send({ error: 'Tarjeta no encontrada' })
    if (card.status !== 'active') return reply.code(409).send({ error: 'Tarjeta bloqueada' })

    const program = await db.query.loyaltyPrograms.findFirst({ where: (p, { eq }) => eq(p.id, card.programId) })
    if (!program || !program.active) return reply.code(409).send({ error: 'Programa inactivo' })

    const now = new Date()
    if (!canEarnToday(card.lastScanAt, now)) {
      return reply.send({
        card,
        earned: 0,
        alreadyScannedToday: true,
        reachedReward: hasReachedReward(card.points, program.rewardThreshold),
        pointsToReward: pointsToReward(card.points, program.rewardThreshold),
        message: 'Ya se registró una visita hoy',
      })
    }

    const earned = program.pointsPerVisit
    const newPoints = card.points + earned

    const [updated] = await db.update(loyaltyCards).set({
      points: newPoints,
      totalVisits: card.totalVisits + 1,
      lastScanAt: now,
    }).where(and(eq(loyaltyCards.id, card.id), eq(loyaltyCards.tenantId, tenantId))).returning()

    await db.insert(loyaltyTransactions).values({
      tenantId, cardId: card.id, type: 'earn', points: earned, balanceAfter: newPoints,
      performedBy: request.user.id,
    })

    // Immediate pass update (background, non-blocking).
    pushDispatcher.updateCard(card.id)

    return reply.send({
      card: updated,
      earned,
      alreadyScannedToday: false,
      reachedReward: hasReachedReward(newPoints, program.rewardThreshold),
      pointsToReward: pointsToReward(newPoints, program.rewardThreshold),
    })
  })

  // ─── Redeem a reward (subtract threshold points) ───────────────────────────
  app.post('/api/admin/loyalty/cards/:id/redeem', { preHandler: requirePermission('loyalty.scan') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenantId = request.tenant.id
    const card = await db.query.loyaltyCards.findFirst({
      where: (c, { eq, and }) => and(eq(c.id, id), eq(c.tenantId, tenantId)),
    })
    if (!card) return reply.code(404).send({ error: 'Tarjeta no encontrada' })

    const program = await db.query.loyaltyPrograms.findFirst({ where: (p, { eq }) => eq(p.id, card.programId) })
    if (!program?.rewardThreshold) return reply.code(409).send({ error: 'El programa no tiene recompensa configurada' })
    if (card.points < program.rewardThreshold) return reply.code(409).send({ error: 'Puntos insuficientes para canjear' })

    const newPoints = card.points - program.rewardThreshold
    const [updated] = await db.update(loyaltyCards).set({ points: newPoints })
      .where(and(eq(loyaltyCards.id, id), eq(loyaltyCards.tenantId, tenantId))).returning()
    await db.insert(loyaltyTransactions).values({
      tenantId, cardId: id, type: 'redeem', points: -program.rewardThreshold, balanceAfter: newPoints,
      performedBy: request.user.id, note: program.rewardDescription ?? 'Canje de recompensa',
    })
    pushDispatcher.updateCard(id)
    return reply.send({ card: updated })
  })

  // ─── Manual adjustment (admin) ─────────────────────────────────────────────
  app.post('/api/admin/loyalty/cards/:id/adjust', { preHandler: requirePermission('loyalty.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = loyaltyAdjustSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' })
    const tenantId = request.tenant.id

    const card = await db.query.loyaltyCards.findFirst({
      where: (c, { eq, and }) => and(eq(c.id, id), eq(c.tenantId, tenantId)),
    })
    if (!card) return reply.code(404).send({ error: 'Tarjeta no encontrada' })

    const newPoints = Math.max(0, card.points + parsed.data.points)
    const [updated] = await db.update(loyaltyCards).set({ points: newPoints })
      .where(and(eq(loyaltyCards.id, id), eq(loyaltyCards.tenantId, tenantId))).returning()
    await db.insert(loyaltyTransactions).values({
      tenantId, cardId: id, type: 'adjust', points: parsed.data.points, balanceAfter: newPoints,
      performedBy: request.user.id, note: parsed.data.note,
    })
    pushDispatcher.updateCard(id)
    return reply.send({ card: updated })
  })

  // ─── Campaigns (offer broadcast) ───────────────────────────────────────────
  app.get('/api/admin/loyalty/campaigns', { preHandler: requirePermission('loyalty.manage') }, async (request) => {
    return db.query.loyaltyCampaigns.findMany({
      where: (c, { eq }) => eq(c.tenantId, request.tenant.id),
      orderBy: (c, { desc }) => [desc(c.createdAt)],
      limit: 50,
    })
  })

  app.get('/api/admin/loyalty/campaigns/:id', { preHandler: requirePermission('loyalty.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const campaign = await db.query.loyaltyCampaigns.findFirst({
      where: (c, { eq, and }) => and(eq(c.id, id), eq(c.tenantId, request.tenant.id)),
    })
    if (!campaign) return reply.code(404).send({ error: 'Campaña no encontrada' })
    return campaign
  })

  app.post('/api/admin/loyalty/campaigns', { preHandler: requirePermission('loyalty.manage') }, async (request, reply) => {
    const parsed = loyaltyCampaignSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' })
    const tenantId = request.tenant.id

    // Resolve target program: explicit programId, else the only one (if single).
    let program
    if (parsed.data.programId) {
      program = await db.query.loyaltyPrograms.findFirst({
        where: (p, { eq, and }) => and(eq(p.id, parsed.data.programId!), eq(p.tenantId, tenantId)),
      })
    } else {
      const all = await db.query.loyaltyPrograms.findMany({ where: (p, { eq }) => eq(p.tenantId, tenantId) })
      program = all.length === 1 ? all[0] : undefined
    }
    if (!program) return reply.code(409).send({ error: 'Especifica el programa de la campaña' })

    // Target count = active cards of this program.
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(loyaltyCards)
      .where(and(eq(loyaltyCards.programId, program.id), eq(loyaltyCards.status, 'active')))

    const [campaign] = await db.insert(loyaltyCampaigns).values({
      tenantId,
      programId: program.id,
      message: parsed.data.message,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      status: 'pending',
      targetCount: count ?? 0,
      createdBy: request.user.id,
    }).returning()

    // Kick off the mass update (background, rate-limited, resumable).
    pushDispatcher.runCampaign(campaign.id)

    return reply.code(201).send(campaign)
  })
}
