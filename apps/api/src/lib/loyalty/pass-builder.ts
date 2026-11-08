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
 * `offer` overrides the card's stored currentOffer when provided (campaign run);
 * otherwise the persisted currentOffer is used (e.g. the device's pass pull).
 */
export async function buildPassData(card: CardRow, offer?: string | null): Promise<PassData> {
  const program = await db.query.loyaltyPrograms.findFirst({
    where: (p, { eq }) => eq(p.id, card.programId),
    with: { } as never,
  })
  if (!program) throw new Error('Programa de lealtad no encontrado')

  // Load the card's persisted offer so any regeneration (incl. device pull)
  // reflects the active campaign offer, not just the campaign run. Also the
  // status, to mark the pass as voided when the card was revoked.
  const fullCard = await db.query.loyaltyCards.findFirst({
    where: (c, { eq }) => eq(c.id, card.id),
    columns: { currentOffer: true, status: true },
  })
  const resolvedOffer = offer !== undefined ? offer : (fullCard?.currentOffer ?? null)

  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.id, program.tenantId),
    columns: { name: true, config: true },
  })

  // Branding resolution (Option C): the program's own colors win; when a color
  // is unset, inherit from the tenant's store branding; finally fall back to the
  // neutral defaults (applied downstream in apple/google builders).
  const programBranding = (program.branding ?? {}) as PassBranding
  const tenantBranding = (tenant?.config as any)?.branding ?? {}
  const branding: PassBranding = {
    // Pass background ← program.bgColor OR tenant primary color.
    bgColor: programBranding.bgColor ?? tenantBranding.primaryColor,
    // Foreground: program override, else white (tenant primary is a vivid color,
    // so white text reads best on it).
    fgColor: programBranding.fgColor,
    // Labels ← program.labelColor OR tenant secondary color.
    labelColor: programBranding.labelColor ?? tenantBranding.secondaryColor,
    // Logo: program override, else the tenant store logo.
    logoUrl: programBranding.logoUrl ?? tenantBranding.logoUrl,
  }

  return {
    cardId: card.id,
    serialNumber: card.serialNumber,
    authToken: card.authToken,
    programName: program.name,
    businessName: tenant?.name ?? program.name,
    points: card.points,
    rewardThreshold: program.rewardThreshold,
    rewardDescription: program.rewardDescription,
    offer: resolvedOffer,
    customerName: card.customerName,
    voided: fullCard?.status === 'voided',
    branding,
  }
}
