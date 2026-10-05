import { describe, it, expect } from 'vitest'

// Replicates the cash-session reconciliation logic from routes/cash-sessions.ts.
// Keeping these as pure functions mirrors the existing test style (no DB/HTTP)
// and guards the money math that monthly close/reconciliation depends on.

const round2 = (n: number) => Math.round(n * 100) / 100

function computeExpectedCash(openingFloat: number, cashSales: number): number {
  return round2(openingFloat + cashSales)
}

function computeDifference(closingCount: number, expectedCash: number): number {
  return round2(closingCount - expectedCash)
}

function isLateClose(sessionBusinessDate: string, todayBusinessDate: string): boolean {
  return sessionBusinessDate !== todayBusinessDate
}

// Open validation: returns an error code or null (ok)
function validateOpen(opts: {
  existingOpen?: { businessDate: string } | null
  todaySessionExists: boolean
  today: string
}): 'PENDING_PRIOR_DAY' | 'ALREADY_OPEN' | 'ALREADY_OPENED_TODAY' | null {
  const { existingOpen, todaySessionExists, today } = opts
  if (existingOpen) {
    return existingOpen.businessDate !== today ? 'PENDING_PRIOR_DAY' : 'ALREADY_OPEN'
  }
  if (todaySessionExists) return 'ALREADY_OPENED_TODAY'
  return null
}

describe('Cash session — expected cash & difference', () => {
  it('expected = opening float + cash sales (only cash)', () => {
    // Example from the user: opened with 2700, 1300 in cash sales → expect 4000
    expect(computeExpectedCash(2700, 1300)).toBe(4000)
  })

  it('card/transfer sales do NOT affect expected cash', () => {
    // Only cash is passed in; card/transfer are tracked separately as informational
    expect(computeExpectedCash(500, 0)).toBe(500)
  })

  it('difference is 0 when counted equals expected (cuadra)', () => {
    const expected = computeExpectedCash(2700, 1300)
    expect(computeDifference(4000, expected)).toBe(0)
  })

  it('positive difference = sobrante (over)', () => {
    const expected = computeExpectedCash(1000, 500) // 1500
    expect(computeDifference(1520, expected)).toBe(20)
  })

  it('negative difference = faltante (under)', () => {
    const expected = computeExpectedCash(1000, 500) // 1500
    expect(computeDifference(1450, expected)).toBe(-50)
  })

  it('rounds to 2 decimals (no floating point drift)', () => {
    const expected = computeExpectedCash(0.1, 0.2) // 0.3, not 0.30000000000000004
    expect(expected).toBe(0.3)
    expect(computeDifference(0.3, expected)).toBe(0)
  })
})

describe('Cash session — late close flag', () => {
  it('same day → not late', () => {
    expect(isLateClose('2026-10-05', '2026-10-05')).toBe(false)
  })
  it('session from a previous day → late close', () => {
    expect(isLateClose('2026-10-04', '2026-10-05')).toBe(true)
  })
})

describe('Cash session — open validation', () => {
  it('blocks when a prior-day session is still open (forgot to close)', () => {
    expect(validateOpen({ existingOpen: { businessDate: '2026-10-04' }, todaySessionExists: false, today: '2026-10-05' }))
      .toBe('PENDING_PRIOR_DAY')
  })

  it('blocks when today already has an open session', () => {
    expect(validateOpen({ existingOpen: { businessDate: '2026-10-05' }, todaySessionExists: true, today: '2026-10-05' }))
      .toBe('ALREADY_OPEN')
  })

  it('blocks a second opening the same day (already opened+closed today)', () => {
    expect(validateOpen({ existingOpen: null, todaySessionExists: true, today: '2026-10-05' }))
      .toBe('ALREADY_OPENED_TODAY')
  })

  it('allows opening when no session exists and none today', () => {
    expect(validateOpen({ existingOpen: null, todaySessionExists: false, today: '2026-10-05' }))
      .toBeNull()
  })
})
