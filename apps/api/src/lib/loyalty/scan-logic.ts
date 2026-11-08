/**
 * Pure loyalty business logic — no DB, no I/O. Kept separate so it can be unit
 * tested directly (project pattern: pure functions replicating the logic).
 */

const TZ = process.env.BUSINESS_TIMEZONE ?? 'America/Mexico_City'

/** Business date (YYYY-MM-DD) in the business timezone. */
export function businessDate(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

/**
 * Whether a scan should count toward points.
 * @param scansToday  earn-scans already counted for this card in the current business day
 * @param maxPerDay   program.maxScansPerDay — 0 = unlimited, N = at most N counted/day
 * Rule: a scan counts if under the daily cap (or the cap is unlimited).
 */
export function canEarnToday(scansToday: number, maxPerDay: number): boolean {
  if (maxPerDay <= 0) return true // 0 = unlimited
  return scansToday < maxPerDay
}

/** Whether the card has reached the reward threshold. */
export function hasReachedReward(points: number, threshold: number | null | undefined): boolean {
  if (!threshold || threshold <= 0) return false
  return points >= threshold
}

/** Points remaining to reach the reward (0 if reached or no threshold). */
export function pointsToReward(points: number, threshold: number | null | undefined): number {
  if (!threshold || threshold <= 0) return 0
  return Math.max(0, threshold - points)
}
