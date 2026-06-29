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
    const dateFrom = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const dateTo = to ? new Date(to) : new Date()

    const baseWhere = and(
      eq(sales.tenantId, tenantId),
      eq(sales.status, 'approved'),
      gte(sales.saleDate, dateFrom),
      lte(sales.saleDate, dateTo),
    )

    // Summary
    const salesData = await db.select({
      totalSales: sql<number>`COALESCE(SUM(${sales.total}::numeric), 0)`,
      totalTransactions: sql<number>`COUNT(*)`,
      avgTicket: sql<number>`COALESCE(AVG(${sales.total}::numeric), 0)`,
      totalTips: sql<number>`COALESCE(SUM(${sales.tip}::numeric), 0)`,
      totalDiscount: sql<number>`COALESCE(SUM(${sales.discount}::numeric), 0)`,
    }).from(sales).where(baseWhere)

    // Sales by day
    const salesByDay = await db.select({
      date: sql<string>`DATE(${sales.saleDate})`,
      total: sql<number>`SUM(${sales.total}::numeric)`,
      count: sql<number>`COUNT(*)`,
    }).from(sales).where(baseWhere)
      .groupBy(sql`DATE(${sales.saleDate})`)
      .orderBy(sql`DATE(${sales.saleDate})`)

    // Sales by payment method
    const salesByPayment = await db.select({
      method: sales.paymentMethod,
      total: sql<number>`SUM(${sales.total}::numeric)`,
      count: sql<number>`COUNT(*)`,
    }).from(sales).where(baseWhere)
      .groupBy(sales.paymentMethod)

    // Sales by hour
    const salesByHour = await db.select({
      hour: sql<number>`EXTRACT(HOUR FROM ${sales.saleDate})`,
      total: sql<number>`SUM(${sales.total}::numeric)`,
      count: sql<number>`COUNT(*)`,
    }).from(sales).where(baseWhere)
      .groupBy(sql`EXTRACT(HOUR FROM ${sales.saleDate})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${sales.saleDate})`)

    // Top products
    const topProducts = await db.select({
      productId: saleItems.productId,
      name: products.name,
      totalQty: sql<number>`SUM(${saleItems.quantity})`,
      totalRevenue: sql<number>`SUM(${saleItems.subtotal}::numeric)`,
    }).from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(products, eq(saleItems.productId, products.id))
      .where(baseWhere)
      .groupBy(saleItems.productId, products.name)
      .orderBy(desc(sql`SUM(${saleItems.quantity})`))
      .limit(10)

    // Low stock
    const lowStock = await db.query.products.findMany({
      where: (p, { eq, and, lte }) => and(eq(p.tenantId, tenantId), eq(p.active, true), lte(p.stock, p.minStock)),
      columns: { id: true, name: true, stock: true, minStock: true },
    })

    // Previous period comparison
    const periodLength = dateTo.getTime() - dateFrom.getTime()
    const prevFrom = new Date(dateFrom.getTime() - periodLength)
    const prevTo = dateFrom

    const prevData = await db.select({
      totalSales: sql<number>`COALESCE(SUM(${sales.total}::numeric), 0)`,
      totalTransactions: sql<number>`COUNT(*)`,
    }).from(sales).where(and(
      eq(sales.tenantId, tenantId),
      eq(sales.status, 'approved'),
      gte(sales.saleDate, prevFrom),
      lte(sales.saleDate, prevTo),
    ))

    return {
      summary: salesData[0],
      previousPeriod: prevData[0],
      salesByDay,
      salesByPayment,
      salesByHour,
      topProducts,
      lowStock,
      period: { from: dateFrom, to: dateTo },
    }
  })
}
