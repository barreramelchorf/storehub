import type { FastifyInstance } from 'fastify'
import { db, cashSessions, sales } from '@storehub/db'
import { eq, and, sql } from 'drizzle-orm'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

const TZ = process.env.BUSINESS_TIMEZONE ?? 'America/Mexico_City'
function businessDate(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
}
const round2 = (n: number) => Math.round(n * 100) / 100

// Compute cash reconciliation for a session: sum approved sales by method
// linked to this session. Only cash counts toward expected drawer cash.
async function computeSessionTotals(tenantId: string, sessionId: string) {
  const rows = await db.select({
    method: sales.paymentMethod,
    total: sql<number>`COALESCE(SUM(${sales.total}::numeric), 0)`,
  }).from(sales).where(and(
    eq(sales.tenantId, tenantId),
    eq(sales.cashSessionId, sessionId),
    eq(sales.status, 'approved'),
  )).groupBy(sales.paymentMethod)

  const byMethod: Record<string, number> = { cash: 0, card: 0, transfer: 0, other: 0 }
  for (const r of rows) byMethod[r.method] = round2(Number(r.total))
  return byMethod
}

export async function cashSessionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Current open session (or null)
  app.get('/api/admin/cash-session/current', { preHandler: requirePermission('sales.create') }, async (request) => {
    const open = await db.query.cashSessions.findFirst({
      where: (c, { eq, and }) => and(eq(c.tenantId, request.tenant.id), eq(c.status, 'open')),
    })
    return open ?? null
  })

  // Last closing count — for prefilling the opening float. Minimal data, so it's
  // available to any cashier (sales.create) without exposing full history.
  app.get('/api/admin/cash-session/last-close', { preHandler: requirePermission('sales.create') }, async (request) => {
    const last = await db.query.cashSessions.findFirst({
      where: (c, { eq, and }) => and(eq(c.tenantId, request.tenant.id), eq(c.status, 'closed')),
      orderBy: (c, { desc }) => [desc(c.closedAt)],
      columns: { closingCount: true },
    })
    return { closingCount: last?.closingCount ?? null }
  })

  // Open a session
  app.post('/api/admin/cash-session/open', { preHandler: requirePermission('sales.create') }, async (request, reply) => {
    const { openingFloat } = request.body as { openingFloat?: number }
    if (openingFloat === undefined || openingFloat < 0) {
      return reply.code(400).send({ error: 'El fondo inicial (openingFloat) es requerido y debe ser >= 0' })
    }
    const tenantId = request.tenant.id

    // Block if there's already an open session (possibly from a previous day = forgot to close)
    const existingOpen = await db.query.cashSessions.findFirst({
      where: (c, { eq, and }) => and(eq(c.tenantId, tenantId), eq(c.status, 'open')),
    })
    if (existingOpen) {
      const today = businessDate()
      if (existingOpen.businessDate !== today) {
        return reply.code(409).send({ error: 'Hay una caja abierta de un día anterior sin cerrar. Ciérrala primero.', pendingSessionId: existingOpen.id, pendingBusinessDate: existingOpen.businessDate })
      }
      return reply.code(409).send({ error: 'Ya hay una caja abierta', openSessionId: existingOpen.id })
    }

    // One open per day: block if a session already exists for today (open or closed)
    const today = businessDate()
    const todaySession = await db.query.cashSessions.findFirst({
      where: (c, { eq, and }) => and(eq(c.tenantId, tenantId), eq(c.businessDate, today)),
    })
    if (todaySession) {
      return reply.code(409).send({ error: 'Ya se abrió caja hoy. Solo se permite una apertura por día.' })
    }

    const [session] = await db.insert(cashSessions).values({
      tenantId,
      status: 'open',
      openedBy: request.user.id,
      openingFloat: String(round2(openingFloat)),
      businessDate: today,
    }).returning()

    return reply.code(201).send(session)
  })

  // Close a session (blind count): client sends closingCount, server reveals difference
  app.post('/api/admin/cash-session/close', { preHandler: requirePermission('sales.create') }, async (request, reply) => {
    const { closingCount } = request.body as { closingCount?: number }
    if (closingCount === undefined || closingCount < 0) {
      return reply.code(400).send({ error: 'El conteo de cierre (closingCount) es requerido y debe ser >= 0' })
    }
    const tenantId = request.tenant.id

    const session = await db.query.cashSessions.findFirst({
      where: (c, { eq, and }) => and(eq(c.tenantId, tenantId), eq(c.status, 'open')),
    })
    if (!session) return reply.code(400).send({ error: 'No hay una caja abierta para cerrar' })

    const byMethod = await computeSessionTotals(tenantId, session.id)
    const expectedCash = round2(Number(session.openingFloat) + byMethod.cash)
    const difference = round2(closingCount - expectedCash)
    const lateClose = session.businessDate !== businessDate()

    const [closed] = await db.update(cashSessions).set({
      status: 'closed',
      closedBy: request.user.id,
      closedAt: new Date(),
      closingCount: String(round2(closingCount)),
      expectedCash: String(expectedCash),
      difference: String(difference),
      cashSales: String(byMethod.cash),
      cardSales: String(byMethod.card),
      transferSales: String(byMethod.transfer),
      otherSales: String(byMethod.other),
      lateClose,
    }).where(and(eq(cashSessions.id, session.id), eq(cashSessions.tenantId, tenantId))).returning()

    return closed
  })

  // Reopen a session closed by accident — requires cash.view
  app.post('/api/admin/cash-session/:id/reopen', { preHandler: requirePermission('cash.view') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenantId = request.tenant.id

    // Can't reopen if another session is already open
    const anyOpen = await db.query.cashSessions.findFirst({
      where: (c, { eq, and }) => and(eq(c.tenantId, tenantId), eq(c.status, 'open')),
    })
    if (anyOpen) return reply.code(409).send({ error: 'Ya hay una caja abierta; no se puede reabrir otra' })

    const session = await db.query.cashSessions.findFirst({
      where: (c, { eq, and }) => and(eq(c.id, id), eq(c.tenantId, tenantId)),
    })
    if (!session) return reply.code(404).send({ error: 'Sesión no encontrada' })
    if (session.status !== 'closed') return reply.code(400).send({ error: 'La sesión no está cerrada' })

    const [reopened] = await db.update(cashSessions).set({
      status: 'open', closedBy: null, closedAt: null, closingCount: null,
      expectedCash: null, difference: null, cashSales: null, cardSales: null,
      transferSales: null, otherSales: null,
    }).where(and(eq(cashSessions.id, id), eq(cashSessions.tenantId, tenantId))).returning()

    return reopened
  })

  // History (list closed/open sessions, newest first) — requires cash.view
  app.get('/api/admin/cash-sessions', { preHandler: requirePermission('cash.view') }, async (request) => {
    const { page = '1', pageSize = '30' } = request.query as Record<string, string>
    const limit = Math.min(Number(pageSize), 100)
    const offset = (Number(page) - 1) * limit
    const items = await db.query.cashSessions.findMany({
      where: (c, { eq }) => eq(c.tenantId, request.tenant.id),
      orderBy: (c, { desc }) => [desc(c.openedAt)],
      limit, offset,
    })
    return { items, page: Number(page), pageSize: limit }
  })
}
