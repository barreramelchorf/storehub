/**
 * Public loyalty routes (no auth, tenant resolved by host).
 *  - GET  /api/public/loyalty/enroll           → program info for the signup page
 *  - POST /api/public/loyalty/enroll           → create a card, return wallet links
 *  - GET  /api/public/loyalty/card/:id/apple.pkpass  → signed .pkpass download
 *  - GET  /api/public/loyalty/card/:id/google        → redirect to Google save URL
 */
import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import { db, loyaltyCards } from '@storehub/db'
import { loyaltyEnrollSchema } from '@storehub/schemas'
import { buildApplePass } from '../lib/loyalty/apple-pass.js'
import { buildGoogleSaveUrl } from '../lib/loyalty/google-pass.js'
import { buildPassData, type CardRow } from '../lib/loyalty/pass-builder.js'
import { isAppleConfigured, isGoogleConfigured, getWebServiceBaseUrl } from '../lib/loyalty/config.js'

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
    return {
      programName: program.name,
      rewardDescription: program.rewardDescription,
      rewardThreshold: program.rewardThreshold,
      branding: program.branding,
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
    const { customerName, customerEmail, customerPhone } = parsed.data

    const serialNumber = crypto.randomUUID()
    const authToken = crypto.randomBytes(24).toString('hex')

    const [card] = await db.insert(loyaltyCards).values({
      tenantId: request.tenant.id,
      programId: program.id,
      customerName,
      customerEmail: customerEmail && customerEmail !== '' ? customerEmail : null,
      customerPhone: customerPhone && customerPhone !== '' ? customerPhone : null,
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
