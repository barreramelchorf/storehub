/**
 * Public loyalty routes (no auth, tenant resolved by host).
 *  - GET  /api/public/loyalty/enroll           → program info for the signup page
 *  - POST /api/public/loyalty/enroll           → create a card, return wallet links
 *  - GET  /api/public/loyalty/card/:id/apple.pkpass  → signed .pkpass download
 *  - GET  /api/public/loyalty/card/:id/google        → redirect to Google save URL
 */
import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import { db, loyaltyCards, loyaltyRecoveryTokens, loyaltyTransactions } from '@storehub/db'
import { eq, and, gt, desc, isNull } from 'drizzle-orm'
import { loyaltyEnrollSchema, loyaltyRecoverRequestSchema } from '@storehub/schemas'
import { duplicateAction, welcomePointsFor, shouldSendRecovery } from '../lib/loyalty/enroll-logic.js'
import { buildApplePass } from '../lib/loyalty/apple-pass.js'
import { PLACEHOLDER_PNG } from '../lib/loyalty/apple-pass.js'
import { buildGoogleSaveUrl } from '../lib/loyalty/google-pass.js'
import { buildPassData, type CardRow } from '../lib/loyalty/pass-builder.js'
import { isAppleConfigured, isGoogleConfigured, getWebServiceBaseUrl } from '../lib/loyalty/config.js'
import { sendLoyaltyRecoveryEmail } from '../lib/email.js'

function loyaltyEnabled(tenantConfig: unknown): boolean {
  const modules = (tenantConfig as { modules?: Record<string, boolean> } | null)?.modules
  return modules?.loyalty === true
}

/**
 * Resolve which program the enrollment targets.
 * - If programId is given, use that specific active program of the tenant.
 * - If not given (legacy links / single-program tenants), fall back to the only
 *   active program — but only when there's exactly one, to avoid ambiguity.
 * Returns null if it can't resolve unambiguously.
 */
async function resolveProgram(tenantId: string, programId?: string) {
  if (programId) {
    return db.query.loyaltyPrograms.findFirst({
      where: (p, { eq, and }) => and(eq(p.id, programId), eq(p.tenantId, tenantId), eq(p.active, true)),
    })
  }
  const active = await db.query.loyaltyPrograms.findMany({
    where: (p, { eq, and }) => and(eq(p.tenantId, tenantId), eq(p.active, true)),
  })
  return active.length === 1 ? active[0] : null
}

async function toCardRow(id: string): Promise<CardRow | null> {
  const card = await db.query.loyaltyCards.findFirst({ where: (c, { eq }) => eq(c.id, id) })
  if (!card) return null
  return {
    id: card.id,
    serialNumber: card.serialNumber,
    authToken: card.authToken,
    customerName: card.customerName,
    points: card.points,
    programId: card.programId,
  }
}

/**
 * Issue a single-use recovery link (30 min) and email it to the address registered
 * on the card. Throttled per card so nobody can flood a customer's inbox: at most
 * one email every 5 minutes and 3 per hour (see enroll-logic.ts). Returns:
 *  - 'sent'      a new link was created and emailed
 *  - 'throttled' skipped because a link was sent recently (the earlier one still works)
 *  - 'no_email'  the card has no email on file (legacy cards)
 */
async function issueRecoveryEmail(
  tenant: { id: string; slug: string; name: string },
  card: { id: string; customerName: string; customerEmail: string | null },
): Promise<'sent' | 'throttled' | 'no_email'> {
  if (!card.customerEmail) return 'no_email'

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const recent = await db.select({ createdAt: loyaltyRecoveryTokens.createdAt })
    .from(loyaltyRecoveryTokens)
    .where(and(eq(loyaltyRecoveryTokens.cardId, card.id), gt(loyaltyRecoveryTokens.createdAt, hourAgo)))
    .orderBy(desc(loyaltyRecoveryTokens.createdAt))
  if (!shouldSendRecovery(recent[0]?.createdAt ?? null, recent.length)) return 'throttled'

  const token = crypto.randomBytes(24).toString('hex')
  await db.insert(loyaltyRecoveryTokens).values({
    tenantId: tenant.id,
    cardId: card.id,
    token,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
  })
  const recoveryUrl = `${getWebServiceBaseUrl()}/t/${tenant.slug}/loyalty/recover/${token}`
  await sendLoyaltyRecoveryEmail({
    to: card.customerEmail,
    customerName: card.customerName,
    tenantName: tenant.name,
    recoveryUrl,
  }).catch(() => {})
  return 'sent'
}

export async function loyaltyPublicRoutes(app: FastifyInstance) {
  // Program info for the enrollment page (optionally for a specific program)
  app.get('/api/public/loyalty/enroll', async (request, reply) => {
    if (!loyaltyEnabled(request.tenant.config)) {
      return reply.code(404).send({ error: 'Programa de lealtad no disponible' })
    }
    const { program: programId } = request.query as { program?: string }
    const program = await resolveProgram(request.tenant.id, programId)
    if (!program) {
      // Could not resolve: either no program, or multiple and none specified.
      return reply.code(404).send({ error: 'Programa de lealtad no disponible', needsProgram: true })
    }
    // Option C: program branding wins, inherit tenant store branding when unset.
    const pb = (program.branding ?? {}) as Record<string, string>
    const tb = ((request.tenant.config as any)?.branding ?? {}) as Record<string, string>
    return {
      programId: program.id,
      programName: program.name,
      rewardDescription: program.rewardDescription,
      rewardThreshold: program.rewardThreshold,
      branding: {
        bgColor: pb.bgColor ?? tb.primaryColor,
        fgColor: pb.fgColor,
        labelColor: pb.labelColor ?? tb.secondaryColor,
        logoUrl: pb.logoUrl ?? tb.logoUrl,
      },
      businessName: request.tenant.name,
    }
  })

  // List active programs of the tenant (for pickers / multi-program UIs).
  app.get('/api/public/loyalty/programs', async (request, reply) => {
    if (!loyaltyEnabled(request.tenant.config)) {
      return reply.code(404).send({ error: 'Programa de lealtad no disponible' })
    }
    const programs = await db.query.loyaltyPrograms.findMany({
      where: (p, { eq, and }) => and(eq(p.tenantId, request.tenant.id), eq(p.active, true)),
      columns: { id: true, name: true, rewardDescription: true, rewardThreshold: true },
    })
    return { programs, businessName: request.tenant.name }
  })

  // Self-enrollment: create a card, return wallet links
  app.post('/api/public/loyalty/enroll', async (request, reply) => {
    if (!loyaltyEnabled(request.tenant.config)) {
      return reply.code(404).send({ error: 'Programa de lealtad no disponible' })
    }

    const parsed = loyaltyEnrollSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' })
    }
    const { customerName, customerEmail, customerPhone, birthDate, programId } = parsed.data

    const program = await resolveProgram(request.tenant.id, programId)
    if (!program) {
      return reply.code(404).send({ error: 'Programa de lealtad no disponible', needsProgram: true })
    }

    const email = customerEmail.trim().toLowerCase()

    // Duplicate detection: one card per email PER PROGRAM and one per phone PER
    // PROGRAM. Voided cards don't count (a revoked card can register again), but
    // BLOCKED cards do: a banned customer can't come back with the same email/phone.
    const byEmail = await db.query.loyaltyCards.findFirst({
      where: (c, { eq, ne, and, sql }) => and(
        eq(c.programId, program.id),
        ne(c.status, 'voided'),
        sql`lower(${c.customerEmail}) = ${email}`,
      ),
    })
    // customerPhone is already normalized to 10 digits; compare against the last
    // 10 digits of the stored value so legacy free-format numbers also match.
    const byPhone = byEmail ? undefined : await db.query.loyaltyCards.findFirst({
      where: (c, { eq, ne, and, sql }) => and(
        eq(c.programId, program.id),
        ne(c.status, 'voided'),
        sql`right(regexp_replace(coalesce(${c.customerPhone}, ''), '[^0-9]', '', 'g'), 10) = ${customerPhone}`,
      ),
    })
    const existing = byEmail ?? byPhone
    const action = duplicateAction(existing?.status)

    if (action === 'reject') {
      // Neutral message: don't reveal that the customer was blocked.
      return reply.code(403).send({ error: 'No fue posible completar tu registro. Contacta al negocio.' })
    }

    if (action === 'recover' && existing) {
      // On a match we DO NOT create a new card: we send a single-use recovery link
      // to the email registered on the existing card, so only its owner can get it.
      // Throttled sends are silent (an earlier link is still valid).
      const outcome = await issueRecoveryEmail(request.tenant, existing)
      if (outcome === 'no_email') {
        // Legacy cards may lack an email; without it there's nowhere to send recovery.
        return reply.code(409).send({ error: 'Ese celular ya tiene una tarjeta. Pide ayuda en el negocio para recuperarla.' })
      }
      return reply.code(200).send({ recovery: true, matchedBy: byEmail ? 'email' : 'phone' })
    }

    // New card. If this person already had a (now voided) card in this program,
    // don't hand out the welcome points a second time.
    const priorRevoked = await db.query.loyaltyCards.findFirst({
      where: (c, { eq, and, or, sql }) => and(
        eq(c.programId, program.id),
        eq(c.status, 'voided'),
        or(
          sql`lower(${c.customerEmail}) = ${email}`,
          sql`right(regexp_replace(coalesce(${c.customerPhone}, ''), '[^0-9]', '', 'g'), 10) = ${customerPhone}`,
        ),
      ),
      columns: { id: true },
    })

    const serialNumber = crypto.randomUUID()
    const authToken = crypto.randomBytes(24).toString('hex')
    const welcome = welcomePointsFor(program.welcomePoints ?? 0, !!priorRevoked)

    const [card] = await db.insert(loyaltyCards).values({
      tenantId: request.tenant.id,
      programId: program.id,
      customerName,
      customerEmail: email,
      customerPhone,
      birthDate: birthDate && birthDate !== '' ? birthDate : null,
      points: welcome,
      totalVisits: welcome > 0 ? 1 : 0,
      serialNumber,
      authToken,
    }).returning()

    // Record welcome points as an auditable 'earn' transaction.
    if (welcome > 0) {
      await db.insert(loyaltyTransactions).values({
        tenantId: request.tenant.id,
        cardId: card.id,
        type: 'earn',
        points: welcome,
        balanceAfter: welcome,
        note: 'Puntos de bienvenida (registro)',
      })
    }

    const base = getWebServiceBaseUrl()
    return reply.code(201).send({
      cardId: card.id,
      appleUrl: isAppleConfigured() ? `${base}/api/public/loyalty/card/${card.id}/apple.pkpass` : null,
      googleUrl: isGoogleConfigured() ? `${base}/api/public/loyalty/card/${card.id}/google` : null,
    })
  })

  // Quick recovery request from the enrollment page: the customer gives EITHER the
  // email OR the phone they registered with. The response is ALWAYS the same generic
  // one (OWASP: don't reveal whether an account exists) and the email is sent in the
  // background so response time doesn't leak it either. Only ACTIVE cards are
  // recoverable; blocked/voided ones silently get nothing.
  app.post('/api/public/loyalty/recover', async (request, reply) => {
    if (!loyaltyEnabled(request.tenant.config)) {
      return reply.code(404).send({ error: 'Programa de lealtad no disponible' })
    }
    const parsed = loyaltyRecoverRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' })
    }
    const { email, phone, programId } = parsed.data
    const program = await resolveProgram(request.tenant.id, programId)
    if (!program) {
      return reply.code(404).send({ error: 'Programa de lealtad no disponible', needsProgram: true })
    }

    const normalizedEmail = email?.trim().toLowerCase()
    const card = await db.query.loyaltyCards.findFirst({
      where: (c, { eq, and, or, sql }) => {
        const matches = []
        if (normalizedEmail) matches.push(sql`lower(${c.customerEmail}) = ${normalizedEmail}`)
        if (phone) matches.push(sql`right(regexp_replace(coalesce(${c.customerPhone}, ''), '[^0-9]', '', 'g'), 10) = ${phone}`)
        return and(eq(c.programId, program.id), eq(c.status, 'active'), or(...matches))
      },
    })

    if (card) {
      const tenant = { id: request.tenant.id, slug: request.tenant.slug, name: request.tenant.name }
      void issueRecoveryEmail(tenant, card).catch((err) => request.log.error({ err }, 'recovery email failed'))
    }
    return reply.send({ ok: true })
  })

  // Validate a recovery link WITHOUT spending it. Email scanners and browser
  // prefetch follow links with GET, so GET must be inert: it only tells the page
  // who the card belongs to. The token is spent by the POST below (button click).
  app.get('/api/public/loyalty/recover/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const row = await db.query.loyaltyRecoveryTokens.findFirst({
      where: (t, { eq, and }) => and(eq(t.token, token), eq(t.tenantId, request.tenant.id)),
    })
    if (!row) return reply.code(404).send({ error: 'Enlace inválido' })
    if (row.usedAt) return reply.code(410).send({ error: 'Este enlace ya fue usado' })
    if (row.expiresAt.getTime() < Date.now()) return reply.code(410).send({ error: 'Este enlace expiró' })

    const card = await db.query.loyaltyCards.findFirst({ where: (c, { eq }) => eq(c.id, row.cardId) })
    if (!card) return reply.code(404).send({ error: 'Tarjeta no encontrada' })
    if (card.status !== 'active') return reply.code(410).send({ error: 'Esta tarjeta ya no está disponible. Regístrate de nuevo o contacta al negocio.' })

    // Only the first name: enough for a greeting, nothing sensitive.
    return reply.send({ customerName: card.customerName.split(' ')[0] })
  })

  // Spend the recovery link and return the EXISTING card's wallet links. The claim
  // is atomic (UPDATE ... WHERE used_at IS NULL AND not expired), so two concurrent
  // clicks can't both succeed.
  app.post('/api/public/loyalty/recover/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const row = await db.query.loyaltyRecoveryTokens.findFirst({
      where: (t, { eq, and }) => and(eq(t.token, token), eq(t.tenantId, request.tenant.id)),
    })
    if (!row) return reply.code(404).send({ error: 'Enlace inválido' })
    if (row.usedAt) return reply.code(410).send({ error: 'Este enlace ya fue usado' })
    if (row.expiresAt.getTime() < Date.now()) return reply.code(410).send({ error: 'Este enlace expiró' })

    // Check the card BEFORE spending the token, so an unusable card doesn't burn it.
    const card = await db.query.loyaltyCards.findFirst({ where: (c, { eq }) => eq(c.id, row.cardId) })
    if (!card) return reply.code(404).send({ error: 'Tarjeta no encontrada' })
    if (card.status !== 'active') return reply.code(410).send({ error: 'Esta tarjeta ya no está disponible. Regístrate de nuevo o contacta al negocio.' })

    const [claimed] = await db.update(loyaltyRecoveryTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(loyaltyRecoveryTokens.id, row.id), isNull(loyaltyRecoveryTokens.usedAt), gt(loyaltyRecoveryTokens.expiresAt, new Date())))
      .returning({ id: loyaltyRecoveryTokens.id })
    if (!claimed) return reply.code(410).send({ error: 'Este enlace ya fue usado o expiró' })

    const base = getWebServiceBaseUrl()
    return reply.send({
      customerName: card.customerName,
      points: card.points,
      appleUrl: isAppleConfigured() ? `${base}/api/public/loyalty/card/${card.id}/apple.pkpass` : null,
      googleUrl: isGoogleConfigured() ? `${base}/api/public/loyalty/card/${card.id}/google` : null,
    })
  })
}

/**
 * Pass download routes — NOT tenant-scoped. These are opened directly by the
 * browser ("Add to Wallet") against the platform domain, so there's no
 * x-tenant-slug header. The tenant is implied by the card id itself, so we
 * resolve everything from the card without needing resolveTenant.
 */
export async function loyaltyPassRoutes(app: FastifyInstance) {
  // Apple .pkpass download
  app.get('/api/public/loyalty/card/:id/apple.pkpass', async (request, reply) => {
    if (!isAppleConfigured()) return reply.code(503).send({ error: 'Apple Wallet no configurado' })
    const { id } = request.params as { id: string }
    const cardRow = await toCardRow(id)
    if (!cardRow) return reply.code(404).send({ error: 'Tarjeta no encontrada' })

    const data = await buildPassData(cardRow)
    const buffer = await buildApplePass(data)
    reply
      .header('Content-Type', 'application/vnd.apple.pkpass')
      .header('Content-Disposition', `attachment; filename="${cardRow.serialNumber}.pkpass"`)
    return reply.send(buffer)
  })

  // Default logo for Google classes of programs without a logo (Google requires one)
  app.get('/api/public/loyalty/default-logo.png', async (_request, reply) => {
    return reply.header('Content-Type', 'image/png').header('Cache-Control', 'public, max-age=86400').send(PLACEHOLDER_PNG)
  })

  // Google save redirect
  app.get('/api/public/loyalty/card/:id/google', async (request, reply) => {
    if (!isGoogleConfigured()) return reply.code(503).send({ error: 'Google Wallet no configurado' })
    const { id } = request.params as { id: string }
    const cardRow = await toCardRow(id)
    if (!cardRow) return reply.code(404).send({ error: 'Tarjeta no encontrada' })

    const data = await buildPassData(cardRow)
    const url = await buildGoogleSaveUrl(data, cardRow.programId)
    return reply.redirect(url)
  })
}
