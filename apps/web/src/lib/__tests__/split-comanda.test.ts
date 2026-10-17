import { describe, it, expect } from 'vitest'

// Replicates the "split comanda" logic from the POS page (apps/web/.../pos/page.tsx).
// Pure function mirrors the project's test style (no React/DOM). Guards the
// money/quantity math: moving a subset of units to a brand-new comanda while the
// rest stays in the original, respecting per-line quantities and modifiers.

interface Modifier { id: string; name: string; price: number }
interface CartItem { productId: string; name: string; price: number; quantity: number; modifiers?: Modifier[] }

// selection maps cart index -> units to move
function splitCart(cart: CartItem[], selection: Record<number, number>): {
  moved: CartItem[]
  remaining: CartItem[]
  movedUnits: number
} {
  const moved: CartItem[] = []
  const remaining: CartItem[] = []
  cart.forEach((item, idx) => {
    const moveQty = Math.max(0, Math.min(selection[idx] ?? 0, item.quantity))
    if (moveQty > 0) moved.push({ ...item, quantity: moveQty })
    const keepQty = item.quantity - moveQty
    if (keepQty > 0) remaining.push({ ...item, quantity: keepQty })
  })
  const movedUnits = moved.reduce((s, i) => s + i.quantity, 0)
  return { moved, remaining, movedUnits }
}

const sum = (items: CartItem[]) => items.reduce((s, i) => s + i.price * i.quantity, 0)
const units = (items: CartItem[]) => items.reduce((s, i) => s + i.quantity, 0)

describe('Split comanda — quantity math', () => {
  const cart: CartItem[] = [
    { productId: 'cafe', name: 'Café', price: 50, quantity: 2 },
    { productId: 'pan', name: 'Pan', price: 30, quantity: 1 },
    { productId: 'jugo', name: 'Jugo', price: 40, quantity: 1 },
  ]

  it("user case: 4 products, each person pays 2 — moving half keeps totals exact", () => {
    // Move 1 café + 1 jugo to a new comanda
    const { moved, remaining, movedUnits } = splitCart(cart, { 0: 1, 2: 1 })
    expect(movedUnits).toBe(2)
    expect(sum(moved)).toBe(90) // 50 café + 40 jugo
    expect(sum(remaining)).toBe(80) // 50 café + 30 pan
    // Conservation: nothing created or lost
    expect(sum(moved) + sum(remaining)).toBe(sum(cart))
    expect(units(moved) + units(remaining)).toBe(units(cart))
  })

  it('splits same product by unit (both ordered the same café)', () => {
    const { moved, remaining } = splitCart(cart, { 0: 1 })
    expect(moved).toEqual([{ productId: 'cafe', name: 'Café', price: 50, quantity: 1 }])
    const cafeRemaining = remaining.find(i => i.productId === 'cafe')
    expect(cafeRemaining?.quantity).toBe(1)
  })

  it('a fully-moved line disappears from the original', () => {
    const { moved, remaining } = splitCart(cart, { 1: 1 }) // move the single pan
    expect(moved).toHaveLength(1)
    expect(remaining.find(i => i.productId === 'pan')).toBeUndefined()
    expect(units(remaining)).toBe(3) // 2 café + 1 jugo
  })

  it('preserves modifiers on moved items', () => {
    const withMods: CartItem[] = [
      { productId: 'latte', name: 'Latte', price: 55, quantity: 2, modifiers: [{ id: 'm1', name: 'Extra shot', price: 5 }] },
    ]
    const { moved } = splitCart(withMods, { 0: 1 })
    expect(moved[0].modifiers).toEqual([{ id: 'm1', name: 'Extra shot', price: 5 }])
    expect(moved[0].quantity).toBe(1)
  })

  it('clamps selection to available quantity', () => {
    const { moved, remaining } = splitCart(cart, { 0: 99 }) // asking more than 2
    expect(moved[0].quantity).toBe(2)
    expect(remaining.find(i => i.productId === 'cafe')).toBeUndefined()
  })

  it('zero/empty selection moves nothing', () => {
    const { moved, remaining, movedUnits } = splitCart(cart, {})
    expect(movedUnits).toBe(0)
    expect(moved).toHaveLength(0)
    expect(units(remaining)).toBe(units(cart))
  })
})
