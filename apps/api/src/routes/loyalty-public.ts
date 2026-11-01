/**
 * Public loyalty routes (no auth, tenant resolved by host).
 *  - GET  /api/public/loyalty/enroll           → program info for the signup page
 *  - POST /api/public/loyalty/enroll           → create a card, return wallet links
 *  - GET  /api/public/loyalty/card/:id/apple.pkpass  → signed .pkpass download
 *  - GET  /api/public/loyalty/card/:id/google        → redirect to Google save URL
 */
import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import { db, loyaltyCards, loyaltyRecoveryTokens } from '@storehub/db'
import { eq } from 'drizzle-orm'
import { loyaltyEnrollSchema } from '@storehub/schemas'
import { buildApplePass } from '../lib/loyalty/apple-pass.js'
import { buildGoogleSaveUrl } from '../lib/loyalty/google-pass.js'
import { buildPassData, type CardRow } from '../lib/loyalty/pass-builder.js'
import { isAppleConfigured, isGoogleConfigured, getWebServiceBaseUrl } from '../lib/loyalty/config.js'
import { sendLoyaltyRecoveryEmail } from '../lib/email.js'

function loyaltyEnabled(tenantConfig: unknown): boolean {
  const modules = (tenantConfig as { modules?: Record<string, boolean> } | null)?.modules
  return modules?.loyalty === true
}

async function activeProgram(tenantId: string) {
  return db.query.loyaltyPrograms.findFirst({
    where: (p, { eq, and }) => and(eq(p.tenantId, tenantId), eq(p.active, true)),
  })
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

export async function loyaltyPublicRoutes(app: FastifyInstance) {
  // Program info for the enrollment page
  app.get('/api/public/loyalty/enroll', async (request, reply) => {
    if (!loyaltyEnabled(request.tenant.config)) {
      return reply.code(404).send({ error: 'Programa de lealtad no disponible' })
    }
    const program = await activeProgram(request.tenant.id)
    if (!program) return reply.code(404).send({ error: 'Programa de lealtad no disponible' })
    // Option C: program branding wins, inherit tenant store branding when unset.
    const pb = (program.branding ?? {}) as Record<string, string>
    const tb = ((request.tenant.config as any)?.branding ?? {}) as Record<string, string>
    return {
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

  // Self-enrollment: create a card, return wallet links
  app.post('/api/public/loyalty/enroll', async (request, reply) => {
    if (!loyaltyEnabled(request.tenant.config)) {
      return reply.code(404).send({ error: 'Programa de lealtad no disponible' })
    }
    const program = await activeProgram(request.tenant.id)
    if (!program) return reply.code(404).send({ error: 'Programa de lealtad no disponible' })

    const parsed = loyaltyEnrollSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' })
    }
    const { customerName, customerEmail, customerPhone, birthDate } = parsed.data
    const email = customerEmail.trim().toLowerCase()

    // Duplicate detection: one card per email per tenant. If a card already
    // exists for this email, DO NOT create a new one — send a single-use
    // recovery link to the registered email so only the owner can retrieve it.
    const existing = await db.query.loyaltyCards.findFirst({
      where: (c, { eq, and, sql }) => and(
        eq(c.tenantId, request.tenant.id),
        sql`lower(${c.customerEmail}) = ${email}`,
      ),
    })

    if (existing) {
      const token = crypto.randomBytes(24).toString('hex')
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 min
      await db.insert(loyaltyRecoveryTokens).values({
        tenantId: request.tenant.id,
        cardId: existing.id,
        token,
        expiresAt,
      })
      const base = getWebServiceBaseUrl()
      const recoveryUrl = `${base}/t/${request.tenant.slug}/loyalty/recover/${token}`
      await sendLoyaltyRecoveryEmail({
        to: existing.customerEmail!,
        customerName: existing.customerName,
        tenantName: request.tenant.name,
        recoveryUrl,
      }).catch(() => {})
      // Same response whether or not it existed is not needed here (user knows
      // their own email); explicit is clearer for the UI.
      return reply.code(200).send({ recovery: true })
    }

    const serialNumber = crypto.randomUUID()
    const authToken = crypto.randomBytes(24).toString('hex')

    const [card] = await db.insert(loyaltyCards).values({
      tenantId: request.tenant.id,
      programId: program.id,
      customerName,
      customerEmail: email,
      customerPhone: customerPhone && customerPhone !== '' ? customerPhone : null,
      birthDate: birthDate && birthDate !== '' ? birthDate : null,
      serialNumber,
      authToken,
    }).returning()

    const base = getWebServiceBaseUrl()
    return reply.code(201).send({
      cardId: card.id,
      appleUrl: isAppleConfigured() ? `${base}/api/public/loyalty/card/${card.id}/apple.pkpass` : null,
      googleUrl: isGoogleConfigured() ? `${base}/api/public/loyalty/card/${card.id}/google` : null,
    })
  })

  // Consume a recovery token: validate (unused, not expired, right tenant) and
  // return the EXISTING card's wallet links. Marks the token used.
  app.get('/api/public/loyalty/recover/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const row = await db.query.loyaltyRecoveryTokens.findFirst({
      where: (t, { eq, and }) => and(eq(t.token, token), eq(t.tenantId, request.tenant.id)),
    })
    if (!row) return reply.code(404).send({ error: 'Enlace inválido' })
    if (row.usedAt) return reply.code(410).send({ error: 'Este enlace ya fue usado' })
    if (row.expiresAt.getTime() < Date.now()) return reply.code(410).send({ error: 'Este enlace expiró' })

    const card = await db.query.loyaltyCards.findFirst({
      where: (c, { eq }) => eq(c.id, row.cardId),
    })
    if (!card) return reply.code(404).send({ error: 'Tarjeta no encontrada' })

    // Single use: mark consumed.
    await db.update(loyaltyRecoveryTokens).set({ usedAt: new Date() }).where(eq(loyaltyRecoveryTokens.id, row.id))

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
