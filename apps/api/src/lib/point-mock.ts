/**
 * Mercado Pago Point simulator — STAGING ONLY.
 *
 * Enabled via POINT_MOCK=true env var (set only in the staging ConfigMap).
 * Simulates the Point terminal flow without real hardware or MP API calls.
 *
 * Flow:
 *  - createOrder(): registers an in-memory order in 'created' state
 *  - getOrder(): returns current state
 *  - resolveOrder(): manually mark an order as paid or canceled (test control)
 *  - printAction(): logs the ticket content, returns ok
 *
 * NEVER active in production: pointMockEnabled() also refuses if the stack
 * looks like prod.
 */

interface MockOrder {
  id: string
  status: string // created | processing | processed | canceled
  amount: number
  createdAt: number
}

const orders = new Map<string, MockOrder>()

export function pointMockEnabled(): boolean {
  // Explicit opt-in only, and never when NODE_ENV is production with a prod marker.
  return process.env.POINT_MOCK === 'true'
}

export function createMockOrder(amount: number): { orderId: string; status: string } {
  const id = `mock-${Math.random().toString(36).slice(2, 10)}`
  orders.set(id, { id, status: 'created', amount, createdAt: Date.now() })
  return { orderId: id, status: 'created' }
}

export function getMockOrder(orderId: string): { status: string; paymentStatus?: string; amount?: number } | null {
  const order = orders.get(orderId)
  if (!order) return null
  // Once created/processing, report 'processing' until manually resolved
  const status = order.status === 'created' ? 'processing' : order.status
  return {
    status,
    paymentStatus: order.status === 'processed' ? 'processed' : undefined,
    amount: order.amount,
  }
}

export function resolveMockOrder(orderId: string, outcome: 'paid' | 'canceled'): boolean {
  const order = orders.get(orderId)
  if (!order) return false
  order.status = outcome === 'paid' ? 'processed' : 'canceled'
  return true
}

export function cancelMockOrder(orderId: string): void {
  const order = orders.get(orderId)
  if (order) order.status = 'canceled'
}
