import { describe, it, expect } from 'vitest'

describe('Sales Business Logic', () => {
  function calculateTotal(items: { unitPrice: number; quantity: number }[], discount: number, tip: number): number {
    const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
    return subtotal - discount + tip
  }

  it('calculates total correctly', () => {
    const items = [
      { unitPrice: 45, quantity: 2 },
      { unitPrice: 65, quantity: 1 },
    ]
    expect(calculateTotal(items, 0, 0)).toBe(155)
  })

  it('applies discount', () => {
    const items = [{ unitPrice: 100, quantity: 1 }]
    expect(calculateTotal(items, 10, 0)).toBe(90)
  })

  it('adds tip', () => {
    const items = [{ unitPrice: 100, quantity: 1 }]
    expect(calculateTotal(items, 0, 15)).toBe(115)
  })

  it('handles discount + tip combined', () => {
    const items = [
      { unitPrice: 50, quantity: 2 },
      { unitPrice: 30, quantity: 1 },
    ]
    // subtotal: 130, -20 discount, +10 tip = 120
    expect(calculateTotal(items, 20, 10)).toBe(120)
  })

  function isBackdated(saleDate: string | undefined): boolean {
    if (!saleDate) return false
    return new Date(saleDate).toDateString() !== new Date().toDateString()
  }

  it('detects backdated sales', () => {
    expect(isBackdated('2024-01-01T10:00:00Z')).toBe(true)
    expect(isBackdated(new Date().toISOString())).toBe(false)
    expect(isBackdated(undefined)).toBe(false)
  })
})
