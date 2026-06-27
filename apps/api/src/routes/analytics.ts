import type { FastifyInstance } from 'fastify'
import { db, sales, saleItems, products } from '@storehub/db'
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/api/admin/analytics', { preHandler: requirePermission('analytics.view') }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string }
    const tenantId = request.tenant.id
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86400000)
    const dateTo = to ? new Date(to) : new Date()

    const salesData = await db.select({
      totalSales: sql<number>`COALESCE(SUM(${sales.total}::numeric), 0)`,
      totalTransactions: sql<number>`COUNT(*)`,
      avgTicket: sql<number>`COALESCE(AVG(${sales.total}::numeric), 0)`,
      totalTips: sql<number>`COALESCE(SUM(${sales.tip}::numeric), 0)`,
    }).from(sales).where(and(
      eq(sales.tenantId, tenantId),
      eq(sales.status, 'approved'),
      gte(sales.saleDate, dateFrom),
      lte(sales.saleDate, dateTo),
    ))

    const topProducts = await db.select({
      productId: saleItems.productId,
      name: products.name,
      totalQty: sql<number>`SUM(${saleItems.quantity})`,
      totalRevenue: sql<number>`SUM(${saleItems.subtotal}::numeric)`,
    }).from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(products, eq(saleItems.productId, products.id))
      .where(and(eq(sales.tenantId, tenantId), eq(sales.status, 'approved'), gte(sales.saleDate, dateFrom), lte(sales.saleDate, dateTo)))
      .groupBy(saleItems.productId, products.name)
      .orderBy(desc(sql`SUM(${saleItems.quantity})`))
      .limit(10)

    const lowStock = await db.query.products.findMany({
      where: (p, { eq, and, lte }) => and(eq(p.tenantId, tenantId), eq(p.active, true), lte(p.stock, p.minStock)),
      columns: { id: true, name: true, stock: true, minStock: true },
    })

    return { summary: salesData[0], topProducts, lowStock, period: { from: dateFrom, to: dateTo } }
  })
}
