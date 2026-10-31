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
 * Whether a scan should count toward points, given the card's last scan time.
 * Rule (confirmed): 1 scan counted per business day. A second scan the same day
 * does not add points.
 */
export function canEarnToday(lastScanAt: Date | null, now: Date = new Date()): boolean {
  if (!lastScanAt) return true
  return businessDate(lastScanAt) !== businessDate(now)
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
