/**
 * Apple Wallet web service — the device-facing endpoints that keep passes
 * updated. The paths and contract are DEFINED BY APPLE and must match exactly
 * (see "Adding a Web Service to Update Passes"). The pass embeds
 * webServiceURL = <base>/api/wallet/apple, so all routes live under that prefix.
 *
 * NOT tenant-scoped: the device only knows passTypeId + serialNumber. We resolve
 * the card by serialNumber (globally unique) and authenticate with the pass's
 * per-card authenticationToken via the "Authorization: ApplePass <token>" header.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { db, loyaltyCards, applePassRegistrations } from '@storehub/db'
import { eq, and } from 'drizzle-orm'
import { buildApplePass } from '../lib/loyalty/apple-pass.js'
import { buildPassData, type CardRow } from '../lib/loyalty/pass-builder.js'
import { isAppleConfigured } from '../lib/loyalty/config.js'

const PREFIX = '/api/wallet/apple'

function getPassAuthToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization
  if (!auth?.startsWith('ApplePass ')) return null
  return auth.slice('ApplePass '.length).trim()
}

async function findCardBySerial(serial: string) {
  return db.query.loyaltyCards.findFirst({ where: (c, { eq }) => eq(c.serialNumber, serial) })
}

export async function loyaltyAppleWsRoutes(app: FastifyInstance) {
  // Register a device to receive push updates for a pass.
  app.post(`${PREFIX}/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serial`, async (request, reply) => {
    const { deviceLibraryId, serial } = request.params as { deviceLibraryId: string; passTypeId: string; serial: string }
    const { pushToken } = (request.body ?? {}) as { pushToken?: string }

    const card = await findCardBySerial(serial)
    if (!card) return reply.code(404).send()
    if (getPassAuthToken(request) !== card.authToken) return reply.code(401).send()
    if (!pushToken) return reply.code(400).send()

    const existing = await db.query.applePassRegistrations.findFirst({
      where: (r, { eq, and }) => and(eq(r.cardId, card.id), eq(r.deviceLibraryId, deviceLibraryId)),
    })
    if (existing) return reply.code(200).send() // already registered
    await db.insert(applePassRegistrations).values({ cardId: card.id, deviceLibraryId, pushToken })
    return reply.code(201).send()
  })

  // Unregister a device.
  app.delete(`${PREFIX}/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serial`, async (request, reply) => {
    const { deviceLibraryId, serial } = request.params as { deviceLibraryId: string; passTypeId: string; serial: string }
    const card = await findCardBySerial(serial)
    if (!card) return reply.code(404).send()
    if (getPassAuthToken(request) !== card.authToken) return reply.code(401).send()

    await db.delete(applePassRegistrations).where(and(
      eq(applePassRegistrations.cardId, card.id),
      eq(applePassRegistrations.deviceLibraryId, deviceLibraryId),
    ))
    return reply.code(200).send()
  })

  // List serial numbers of passes updated since `passesUpdatedSince` for a device.
  app.get(`${PREFIX}/v1/devices/:deviceLibraryId/registrations/:passTypeId`, async (request, reply) => {
    const { deviceLibraryId } = request.params as { deviceLibraryId: string; passTypeId: string }
    const { passesUpdatedSince } = request.query as { passesUpdatedSince?: string }

    const regs = await db.query.applePassRegistrations.findMany({
      where: (r, { eq }) => eq(r.deviceLibraryId, deviceLibraryId),
      columns: { cardId: true },
    })
    if (regs.length === 0) return reply.code(204).send()

    const cardIds = regs.map((r) => r.cardId)
    const since = passesUpdatedSince ? new Date(Number(passesUpdatedSince) * 1000) : null

    // Select registered cards, optionally only those changed since the tag.
    // Use pass_updated_at (advances on ANY pass change), NOT last_scan_at.
    const cards = await db.query.loyaltyCards.findMany({
      where: (c, { inArray, and, gt }) => since
        ? and(inArray(c.id, cardIds), gt(c.passUpdatedAt, since))
        : inArray(c.id, cardIds),
      columns: { serialNumber: true, passUpdatedAt: true },
    })
    if (cards.length === 0) return reply.code(204).send()

    const lastUpdated = Math.floor(
      Math.max(...cards.map((c) => c.passUpdatedAt.getTime())) / 1000,
    )
    return reply.send({
      serialNumbers: cards.map((c) => c.serialNumber),
      lastUpdated: String(lastUpdated),
    })
  })

  // Return the latest version of a pass.
  app.get(`${PREFIX}/v1/passes/:passTypeId/:serial`, async (request, reply) => {
    if (!isAppleConfigured()) return reply.code(503).send()
    const { serial } = request.params as { passTypeId: string; serial: string }
    const card = await findCardBySerial(serial)
    if (!card) return reply.code(404).send()
    if (getPassAuthToken(request) !== card.authToken) return reply.code(401).send()

    const cardRow: CardRow = {
      id: card.id,
      serialNumber: card.serialNumber,
      authToken: card.authToken,
      customerName: card.customerName,
      points: card.points,
      programId: card.programId,
    }
    const data = await buildPassData(cardRow)
    const buffer = await buildApplePass(data)
    reply
      .header('Content-Type', 'application/vnd.apple.pkpass')
      .header('Last-Modified', new Date().toUTCString())
    return reply.send(buffer)
  })

  // Device logs (Apple posts diagnostics here). Accept and discard.
  app.post(`${PREFIX}/v1/log`, async (request, reply) => {
    request.log.info({ applePassLog: request.body }, 'Apple Wallet device log')
    return reply.code(200).send()
  })
}
