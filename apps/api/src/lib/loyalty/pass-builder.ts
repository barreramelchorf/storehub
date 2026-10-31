/**
 * Builds the normalized PassData from DB rows. Single source of truth so every
 * caller (enrollment, scan, campaign) produces identical pass content.
 */
import { db } from '@storehub/db'
import type { PassData, PassBranding } from './pass-data.js'

export interface CardRow {
  id: string
  serialNumber: string
  authToken: string
  customerName: string
  points: number
  programId: string
}

/**
 * Load the program + tenant context and assemble PassData for a card.
 * `offer` is optional and passed by the caller (campaigns set it; scans clear it
 * or leave it untouched depending on flow).
 */
export async function buildPassData(card: CardRow, offer?: string | null): Promise<PassData> {
  const program = await db.query.loyaltyPrograms.findFirst({
    where: (p, { eq }) => eq(p.id, card.programId),
    with: { } as never,
  })
  if (!program) throw new Error('Programa de lealtad no encontrado')

  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.id, program.tenantId),
    columns: { name: true },
  })

  const branding = (program.branding ?? {}) as PassBranding

  return {
    cardId: card.id,
    serialNumber: card.serialNumber,
    authToken: card.authToken,
    programName: program.name,
    businessName: tenant?.name ?? program.name,
    points: card.points,
    rewardThreshold: program.rewardThreshold,
    rewardDescription: program.rewardDescription,
    offer: offer ?? null,
    customerName: card.customerName,
    branding,
  }
}
