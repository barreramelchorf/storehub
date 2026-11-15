/**
 * Pure enrollment / recovery decision logic — no DB, no I/O, so it can be unit
 * tested directly (project pattern). The routes feed it rows and act on the result.
 */

export type CardStatus = 'active' | 'blocked' | 'voided'
export type DuplicateAction = 'create' | 'recover' | 'reject'

/**
 * What to do when someone enrolls and a card with the same email/phone may already
 * exist in the program:
 *  - none, or a VOIDED card  -> create a new card (a voided card may register again)
 *  - an ACTIVE card          -> recover it (send a link to the registered email)
 *  - a BLOCKED card          -> reject (the customer was banned; no new card, no recovery)
 */
export function duplicateAction(existingStatus: CardStatus | null | undefined): DuplicateAction {
  if (!existingStatus || existingStatus === 'voided') return 'create'
  if (existingStatus === 'blocked') return 'reject'
  return 'recover'
}

/**
 * Welcome points for a new card. If the same person already had a (now voided)
 * card in this program, they don't get the welcome points a second time.
 */
export function welcomePointsFor(programWelcome: number, hadRevokedCard: boolean): number {
  return hadRevokedCard ? 0 : Math.max(0, programWelcome)
}

/** Recovery-email throttling per card (anti-harassment / anti-flood). */
export const RECOVERY_COOLDOWN_MS = 5 * 60 * 1000
export const RECOVERY_MAX_PER_HOUR = 3

/**
 * Whether a new recovery email may be sent for a card.
 * @param lastCreatedAt   creation time of the most recent token for the card (null if none)
 * @param createdInLastHour number of tokens created for the card in the last hour
 */
export function shouldSendRecovery(
  lastCreatedAt: Date | null,
  createdInLastHour: number,
  now: Date = new Date(),
): boolean {
  if (lastCreatedAt && now.getTime() - lastCreatedAt.getTime() < RECOVERY_COOLDOWN_MS) return false
  return createdInLastHour < RECOVERY_MAX_PER_HOUR
}
