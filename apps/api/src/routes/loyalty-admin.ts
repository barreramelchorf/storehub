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
import { db, loyaltyPrograms, loyaltyCards, loyaltyTransactions, loyaltyCampaigns, applePassRegistrations, loyaltyRecoveryTokens } from '@storehub/db'
import { eq, and, sql } from 'drizzle-orm'
import { loyaltyProgramSchema, loyaltyScanSchema, loyaltyAdjustSchema, loyaltyCampaignSchema, normalizeMxPhone } from '@storehub/schemas'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'
import { canEarnToday, hasReachedReward, pointsToReward, businessDate } from '../lib/loyalty/scan-logic.js'
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
      maxScansPerDay: data.maxScansPerDay,
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
      maxScansPerDay: data.maxScansPerDay,
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
        maxScansPerDay: data.maxScansPerDay,
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
      maxScansPerDay: data.maxScansPerDay,
      rewardThreshold: data.rewardThreshold ?? null,
      rewardDescription: data.rewardDescription ?? null,
      branding: data.branding,
    }).returning()
    return reply.code(201).send(created)
  })

  // ─── Cards ───────────────────────────────────────────────────────────────
  app.get('/api/admin/loyalty/cards', { preHandler: requirePermission('loyalty.manage') }, async (request) => {
    const { page = '1', pageSize = '30', search, program } = request.query as Record<string, string>
    const limit = Math.min(Number(pageSize), 100)
    const offset = (Number(page) - 1) * limit
    const items = await db.query.loyaltyCards.findMany({
      where: (c, { eq, and, or, ilike }) => {
        const conds = [eq(c.tenantId, request.tenant.id)]
        if (program) conds.push(eq(c.programId, program))
        if (search) {
          conds.push(or(
            ilike(c.customerName, `%${search}%`),
            ilike(c.customerPhone, `%${search}%`),
            ilike(c.customerEmail, `%${search}%`),
          )!)
        }
        return and(...conds)
      },
      with: { program: { columns: { id: true, name: true } } },
      orderBy: (c, { desc }) => [desc(c.createdAt)],
      limit, offset,
    })
    return { items, page: Number(page), pageSize: limit }
  })

  // Find active cards by phone number (cashier fallback when the customer forgot
  // their phone/pass). Matches on the normalized 10 digits so legacy free-format
  // numbers ("55 4578 3005") still match. Returns minimal data (no email/birthdate).
  // Registered before /cards/:id; Fastify gives static routes priority anyway.
  app.get('/api/admin/loyalty/cards/by-phone', { preHandler: requirePermission('loyalty.scan') }, async (request, reply) => {
    const { phone } = request.query as { phone?: string }
    const normalized = normalizeMxPhone(phone)
    if (!normalized) return reply.code(400).send({ error: 'Teléfono inválido: deben ser 10 dígitos' })
    const items = await db.query.loyaltyCards.findMany({
      where: (c, { eq, and, sql }) => and(
        eq(c.tenantId, request.tenant.id),
        eq(c.status, 'active'),
        sql`right(regexp_replace(coalesce(${c.customerPhone}, ''), '[^0-9]', '', 'g'), 10) = ${normalized}`,
      ),
      columns: { id: true, customerName: true, points: true },
      with: { program: { columns: { id: true, name: true } } },
      limit: 10,
    })
    return { items }
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

  // Void a card (soft-delete / revoke). admin/gerente via loyalty.manage.
  // Marks the card 'voided', invalidates the pass on the customer's device
  // (Apple voided:true via pull + push, Google state EXPIRED), and blocks scans.
  // The row is kept for traceability; a future purge cronjob removes old voided
  // cards. This is the standard industry pattern (soft-delete then deferred purge).
  app.post('/api/admin/loyalty/cards/:id/void', { preHandler: requirePermission('loyalty.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const card = await db.query.loyaltyCards.findFirst({
      where: (c, { eq, and }) => and(eq(c.id, id), eq(c.tenantId, request.tenant.id)),
    })
    if (!card) return reply.code(404).send({ error: 'Tarjeta no encontrada' })
    if (card.status === 'voided') return reply.code(409).send({ error: 'La tarjeta ya está anulada' })
    if (card.status === 'blocked') return reply.code(409).send({ error: 'La tarjeta está bloqueada. Desbloquéala primero si quieres anularla.' })

    const [updated] = await db.update(loyaltyCards)
      .set({ status: 'voided' })
      .where(and(eq(loyaltyCards.id, id), eq(loyaltyCards.tenantId, request.tenant.id)))
      .returning()

    // Invalidate on the device: push so Apple pulls the voided pass; Google PATCH
    // to EXPIRED. pushDispatcher reads the (now voided) card state via buildPassData.
    pushDispatcher.updateCard(id)

    return reply.send({ card: updated })
  })

  // Block a customer (ban). Like void, the pass is invalidated on the device, but a
  // BLOCKED card still counts as a duplicate: the same email/phone can't register
  // again in this program (see duplicateAction). Reversible with /unblock.
  app.post('/api/admin/loyalty/cards/:id/block', { preHandler: requirePermission('loyalty.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const card = await db.query.loyaltyCards.findFirst({
      where: (c, { eq, and }) => and(eq(c.id, id), eq(c.tenantId, request.tenant.id)),
    })
    if (!card) return reply.code(404).send({ error: 'Tarjeta no encontrada' })
    if (card.status === 'blocked') return reply.code(409).send({ error: 'El cliente ya está bloqueado' })
    if (card.status === 'voided') return reply.code(409).send({ error: 'La tarjeta está anulada; no se puede bloquear' })

    const [updated] = await db.update(loyaltyCards)
      .set({ status: 'blocked' })
      .where(and(eq(loyaltyCards.id, id), eq(loyaltyCards.tenantId, request.tenant.id)))
      .returning()
    await db.insert(loyaltyTransactions).values({
      tenantId: request.tenant.id, cardId: id, type: 'adjust', points: 0, balanceAfter: card.points,
      performedBy: request.user.id, note: 'Cliente bloqueado',
    })
    pushDispatcher.updateCard(id)
    return reply.send({ card: updated })
  })

  // Lift a block. The card becomes active again and the pass is re-published.
  app.post('/api/admin/loyalty/cards/:id/unblock', { preHandler: requirePermission('loyalty.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const card = await db.query.loyaltyCards.findFirst({
      where: (c, { eq, and }) => and(eq(c.id, id), eq(c.tenantId, request.tenant.id)),
    })
    if (!card) return reply.code(404).send({ error: 'Tarjeta no encontrada' })
    if (card.status !== 'blocked') return reply.code(409).send({ error: 'El cliente no está bloqueado' })

    const [updated] = await db.update(loyaltyCards)
      .set({ status: 'active' })
      .where(and(eq(loyaltyCards.id, id), eq(loyaltyCards.tenantId, request.tenant.id)))
      .returning()
    await db.insert(loyaltyTransactions).values({
      tenantId: request.tenant.id, cardId: id, type: 'adjust', points: 0, balanceAfter: card.points,
      performedBy: request.user.id, note: 'Cliente desbloqueado',
    })
    pushDispatcher.updateCard(id)
    return reply.send({ card: updated })
  })

  // Physical delete — kept for purge/cleanup (e.g. future cronjob). Not used by
  // the admin UI (which uses void). admin/gerente via loyalty.manage.
  app.delete('/api/admin/loyalty/cards/:id', { preHandler: requirePermission('loyalty.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const card = await db.query.loyaltyCards.findFirst({
      where: (c, { eq, and }) => and(eq(c.id, id), eq(c.tenantId, request.tenant.id)),
    })
    if (!card) return reply.code(404).send({ error: 'Tarjeta no encontrada' })

    await db.delete(applePassRegistrations).where(eq(applePassRegistrations.cardId, id))
    await db.delete(loyaltyRecoveryTokens).where(eq(loyaltyRecoveryTokens.cardId, id))
    await db.delete(loyaltyTransactions).where(eq(loyaltyTransactions.cardId, id))
    await db.delete(loyaltyCards).where(and(eq(loyaltyCards.id, id), eq(loyaltyCards.tenantId, request.tenant.id)))
    return reply.code(204).send()
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
    if (card.status === 'voided') return reply.code(409).send({ error: 'Tarjeta anulada. Pide al cliente que se registre de nuevo.' })
    if (card.status !== 'active') return reply.code(409).send({ error: 'Tarjeta bloqueada' })

    const program = await db.query.loyaltyPrograms.findFirst({ where: (p, { eq }) => eq(p.id, card.programId) })
    if (!program || !program.active) return reply.code(409).send({ error: 'Programa inactivo' })

    const now = new Date()
    // Count earn-scans already registered TODAY (business day) for this card.
    // Only scans (performedBy not null) count toward the cap; welcome points and
    // manual adjustments are excluded.
    const todayStart = new Date(`${businessDate(now)}T00:00:00`)
    const [{ count: scansToday }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(loyaltyTransactions)
      .where(and(
        eq(loyaltyTransactions.cardId, card.id),
        eq(loyaltyTransactions.type, 'earn'),
        sql`${loyaltyTransactions.performedBy} is not null`,
        sql`${loyaltyTransactions.createdAt} >= ${todayStart}`,
      ))

    if (!canEarnToday(scansToday ?? 0, program.maxScansPerDay)) {
      const limitMsg = program.maxScansPerDay === 1
        ? 'Ya se registró una visita hoy'
        : `Ya se registró el máximo de ${program.maxScansPerDay} visitas hoy`
      return reply.send({
        card,
        earned: 0,
        alreadyScannedToday: true,
        reachedReward: hasReachedReward(card.points, program.rewardThreshold),
        pointsToReward: pointsToReward(card.points, program.rewardThreshold),
        message: limitMsg,
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
      // Audit: visits registered by phone lookup (no QR) are flagged.
      note: parsed.data.via === 'phone' ? 'Visita por teléfono' : null,
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
    if (card.status !== 'active') return reply.code(409).send({ error: 'La tarjeta no está activa; no se puede canjear' })

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
