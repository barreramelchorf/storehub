import { describe, it, expect } from 'vitest'
import {
  businessDate,
  canEarnToday,
  hasReachedReward,
  pointsToReward,
} from '../lib/loyalty/scan-logic.js'
import { hexToRgb } from '../lib/loyalty/pass-data.js'

// Pure-function tests mirroring the project style (no DB/HTTP). These guard the
// loyalty earning rules (1 scan/day), reward math, and color conversion.

describe('Loyalty — canEarnToday (1 scan per business day)', () => {
  it('allows earning when the card has never been scanned', () => {
    expect(canEarnToday(null)).toBe(true)
  })

  it('blocks a second scan on the same business day', () => {
    const now = new Date('2026-10-31T18:00:00Z')
    const earlierSameDay = new Date('2026-10-31T15:00:00Z')
    expect(canEarnToday(earlierSameDay, now)).toBe(false)
  })

  it('allows earning again on a different business day', () => {
    const now = new Date('2026-11-01T18:00:00Z')
    const yesterday = new Date('2026-10-31T15:00:00Z')
    expect(canEarnToday(yesterday, now)).toBe(true)
  })
})

describe('Loyalty — reward math', () => {
  it('not reached when below threshold', () => {
    expect(hasReachedReward(9, 10)).toBe(false)
  })
  it('reached when equal to threshold', () => {
    expect(hasReachedReward(10, 10)).toBe(true)
  })
  it('reached when above threshold', () => {
    expect(hasReachedReward(12, 10)).toBe(true)
  })
  it('never reached when no threshold configured', () => {
    expect(hasReachedReward(100, null)).toBe(false)
    expect(hasReachedReward(100, 0)).toBe(false)
  })

  it('pointsToReward counts down correctly', () => {
    expect(pointsToReward(3, 10)).toBe(7)
  })
  it('pointsToReward is 0 once reached', () => {
    expect(pointsToReward(10, 10)).toBe(0)
    expect(pointsToReward(15, 10)).toBe(0)
  })
  it('pointsToReward is 0 with no threshold', () => {
    expect(pointsToReward(5, null)).toBe(0)
  })
})

describe('Loyalty — businessDate format', () => {
  it('returns YYYY-MM-DD', () => {
    expect(businessDate(new Date('2026-10-31T18:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('Loyalty — hexToRgb (Apple/Google color format)', () => {
  it('converts #RRGGBB to rgb(r, g, b)', () => {
    expect(hexToRgb('#1f2937')).toBe('rgb(31, 41, 55)')
  })
  it('handles hex without leading #', () => {
    expect(hexToRgb('ffffff')).toBe('rgb(255, 255, 255)')
  })
  it('falls back to a safe default on invalid input', () => {
    expect(hexToRgb('not-a-color')).toBe('rgb(31, 41, 55)')
  })
})
