/**
 * PushDispatcher — the single seam between business logic and pass-update
 * delivery. The scan and campaign routes ONLY call this interface; they never
 * know whether delivery happens inline (Option A, today) or via a queue/worker
 * (Option B, future). See spec "Arquitectura de ejecución".
 *
 * Migration path to a worker (documented, intentional):
 *   - `sendCardUpdate(cardId, offer)` is a PURE, standalone function: it does
 *     the actual Apple-push + Google-PATCH for one card. A future BullMQ job
 *     handler calls THIS unchanged.
 *   - `PushDispatcher` is the interface. `InlinePushDispatcher` runs work in the
 *     API process (background for single scans; rate-limited loop for mass ops,
 *     persisting progress to `loyalty_campaigns`). A future `QueuePushDispatcher`
 *     implements the SAME interface by enqueuing jobs. Swap by config, no changes
 *     to routes or to `sendCardUpdate`.
 */
import { db, loyaltyCards, applePassRegistrations, loyaltyCampaigns } from '@storehub/db'
import { eq, and } from 'drizzle-orm'
import { getRateConfig } from './config.js'
import { buildPassData, type CardRow } from './pass-builder.js'
import { sendApplePushes } from './apns.js'
import { updateGoogleObject } from './google-pass.js'

// ─── Pure, reusable unit of work (future worker calls this unchanged) ────────

/**
 * Deliver an update for ONE card: PATCH the Google object and push to all of the
 * card's registered Apple devices. Prunes dead Apple tokens. Best-effort: never
 * throws (push failures must not break the caller's transaction).
 */
export async function sendCardUpdate(cardId: string, offer?: string | null): Promise<void> {
  try {
    const card = await db.query.loyaltyCards.findFirst({
      where: (c, { eq }) => eq(c.id, cardId),
    })
    if (!card) return

    // Advance the pass update tag BEFORE pushing, so when the device pulls the
    // "what changed?" serials list, pass_updated_at is already newer than its
    // previous tag. Without this, iOS ignores the update (the bug campaigns hit).
    // When a campaign passes an offer, persist it too so the device's pass pull
    // (which has no offer param) renders the same offer the push announced.
    await db.update(loyaltyCards)
      .set({ passUpdatedAt: new Date(), ...(offer !== undefined ? { currentOffer: offer } : {}) })
      .where(eq(loyaltyCards.id, cardId))

    const cardRow: CardRow = {
      id: card.id,
      serialNumber: card.serialNumber,
      authToken: card.authToken,
      customerName: card.customerName,
      points: card.points,
      programId: card.programId,
    }
    const data = await buildPassData(cardRow, offer)

    // Google: PATCH the object (safe no-op if unconfigured).
    await updateGoogleObject(data, card.programId).catch(() => false)

    // Apple: push to every registered device for this card.
    const regs = await db.query.applePassRegistrations.findMany({
      where: (r, { eq }) => eq(r.cardId, cardId),
      columns: { id: true, pushToken: true },
    })
    if (regs.length > 0) {
      const results = await sendApplePushes(regs.map((r) => r.pushToken))
      // Prune registrations APNs reports as dead.
      const deadTokens = new Set(results.filter((r) => r.invalidToken).map((r) => r.pushToken))
      if (deadTokens.size > 0) {
        for (const reg of regs) {
          if (deadTokens.has(reg.pushToken)) {
            await db.delete(applePassRegistrations).where(eq(applePassRegistrations.id, reg.id)).catch(() => {})
          }
        }
      }
    }
  } catch {
    // swallow — delivery is best-effort
  }
}

// ─── Dispatcher interface ────────────────────────────────────────────────────

export interface PushDispatcher {
  /** Immediate update for a single card (e.g. after a scan). Non-blocking. */
  updateCard(cardId: string, offer?: string | null): void
  /** Mass update for a campaign: update the offer field on all active cards. */
  runCampaign(campaignId: string): void
}

// ─── Option A: inline implementation (no worker) ─────────────────────────────

class InlinePushDispatcher implements PushDispatcher {
  updateCard(cardId: string, offer?: string | null): void {
    // Fire-and-forget in the same process, after the HTTP response is sent.
    setImmediate(() => { void sendCardUpdate(cardId, offer) })
  }

  runCampaign(campaignId: string): void {
    setImmediate(() => { void this.processCampaign(campaignId) })
  }

  /**
   * Mass operation with rate limiting + DB-persisted progress (resumable).
   * Updates the "Oferta" field on every active card of the campaign's program.
   */
  private async processCampaign(campaignId: string): Promise<void> {
    const { pushRateMax, pushRateMs } = getRateConfig()
    try {
      const campaign = await db.query.loyaltyCampaigns.findFirst({
        where: (c, { eq }) => eq(c.id, campaignId),
      })
      if (!campaign) return

      const cards = await db.query.loyaltyCards.findMany({
        where: (c, { eq, and }) => and(
          eq(c.programId, campaign.programId),
          eq(c.status, 'active'),
        ),
        columns: { id: true },
      })

      await db.update(loyaltyCampaigns)
        .set({ status: 'sending', targetCount: cards.length, sentCount: 0 })
        .where(eq(loyaltyCampaigns.id, campaignId))

      // Rate-limited batches: pushRateMax cards per pushRateMs window.
      let sent = 0
      for (let i = 0; i < cards.length; i += pushRateMax) {
        const batch = cards.slice(i, i + pushRateMax)
        await Promise.all(batch.map((c) => sendCardUpdate(c.id, campaign.message)))
        sent += batch.length
        await db.update(loyaltyCampaigns)
          .set({ sentCount: sent })
          .where(eq(loyaltyCampaigns.id, campaignId))
        if (i + pushRateMax < cards.length) {
          await new Promise((r) => setTimeout(r, pushRateMs))
        }
      }

      await db.update(loyaltyCampaigns)
        .set({ status: 'sent', sentCount: sent })
        .where(eq(loyaltyCampaigns.id, campaignId))
    } catch {
      await db.update(loyaltyCampaigns)
        .set({ status: 'failed' })
        .where(eq(loyaltyCampaigns.id, campaignId))
        .catch(() => {})
    }
  }
}

// Singleton. To migrate to a worker, swap this for QueuePushDispatcher (same
// interface) behind a config flag — nothing else changes.
export const pushDispatcher: PushDispatcher = new InlinePushDispatcher()
