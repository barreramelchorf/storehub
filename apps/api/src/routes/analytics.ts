import type { FastifyInstance } from 'fastify'
import { db, sales, saleItems, products } from '@storehub/db'
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/api/admin/analytics/yearly', { preHandler: requirePermission('analytics.view') }, async (request) => {
    const { year } = request.query as { year?: string }
    const tenantId = request.tenant.id
    const targetYear = year ? Number(year) : new Date().getFullYear()

    // Generate all 12 months for the year
    const months = Array.from({ length: 12 }, (_, i) => i + 1)

    // Sales aggregated by month for the entire year
    const salesByMonth = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM ${sales.saleDate})::int`,
      total: sql<number>`COALESCE(SUM(${sales.total}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
      avgTicket: sql<number>`COALESCE(AVG(${sales.total}::numeric), 0)`,
      tips: sql<number>`COALESCE(SUM(${sales.tip}::numeric), 0)`,
      discounts: sql<number>`COALESCE(SUM(${sales.discount}::numeric), 0)`,
    }).from(sales).where(and(
      eq(sales.tenantId, tenantId),
      eq(sales.status, 'approved'),
      sql`EXTRACT(YEAR FROM ${sales.saleDate}) = ${targetYear}`,
    )).groupBy(sql`EXTRACT(MONTH FROM ${sales.saleDate})`)

    // Build a map for quick lookup
    const monthMap = Object.fromEntries(salesByMonth.map(m => [m.month, m]))

    // Fill all 12 months (months without data get zeros)
    const monthlyData = months.map(m => ({
      month: m,
      total: Number(monthMap[m]?.total ?? 0),
      count: Number(monthMap[m]?.count ?? 0),
      avgTicket: Number(monthMap[m]?.avgTicket ?? 0),
      tips: Number(monthMap[m]?.tips ?? 0),
      discounts: Number(monthMap[m]?.discounts ?? 0),
    }))

    // Year totals
    const yearTotal = monthlyData.reduce((acc, m) => acc + m.total, 0)
    const yearCount = monthlyData.reduce((acc, m) => acc + m.count, 0)

    // Top products per month (top 5 for each month that has data)
    const topProductsByMonth: Record<number, Array<{ productId: string; name: string; totalQty: number; totalRevenue: number }>> = {}

    const monthsWithData = salesByMonth.map(m => m.month)
    if (monthsWithData.length > 0) {
      const topProductsRaw = await db.select({
        month: sql<number>`EXTRACT(MONTH FROM ${sales.saleDate})::int`,
        productId: saleItems.productId,
        name: products.name,
        totalQty: sql<number>`SUM(${saleItems.quantity})::int`,
        totalRevenue: sql<number>`COALESCE(SUM(${saleItems.subtotal}::numeric), 0)`,
      }).from(saleItems)
        .innerJoin(sales, eq(saleItems.saleId, sales.id))
        .innerJoin(products, eq(saleItems.productId, products.id))
        .where(and(
          eq(sales.tenantId, tenantId),
          eq(sales.status, 'approved'),
          sql`EXTRACT(YEAR FROM ${sales.saleDate}) = ${targetYear}`,
        ))
        .groupBy(sql`EXTRACT(MONTH FROM ${sales.saleDate})`, saleItems.productId, products.name)
        .orderBy(sql`EXTRACT(MONTH FROM ${sales.saleDate})`, desc(sql`SUM(${saleItems.quantity})`))

      // Group by month and take top 5 per month
      for (const row of topProductsRaw) {
        if (!topProductsByMonth[row.month]) topProductsByMonth[row.month] = []
        if (topProductsByMonth[row.month].length < 5) {
          topProductsByMonth[row.month].push({
            productId: row.productId,
            name: row.name,
            totalQty: Number(row.totalQty),
            totalRevenue: Number(row.totalRevenue),
          })
        }
      }
    }

    // Fill empty months with empty arrays
    for (const m of months) {
      if (!topProductsByMonth[m]) topProductsByMonth[m] = []
    }

    // Year-wide top products (overall)
    const topProductsYear = await db.select({
      productId: saleItems.productId,
      name: products.name,
      totalQty: sql<number>`SUM(${saleItems.quantity})::int`,
      totalRevenue: sql<number>`COALESCE(SUM(${saleItems.subtotal}::numeric), 0)`,
    }).from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(products, eq(saleItems.productId, products.id))
      .where(and(
        eq(sales.tenantId, tenantId),
        eq(sales.status, 'approved'),
        sql`EXTRACT(YEAR FROM ${sales.saleDate}) = ${targetYear}`,
      ))
      .groupBy(saleItems.productId, products.name)
      .orderBy(desc(sql`SUM(${saleItems.quantity})`))
      .limit(10)

    // Payment method breakdown for the year
    const paymentMethods = await db.select({
      method: sales.paymentMethod,
      total: sql<number>`COALESCE(SUM(${sales.total}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
    }).from(sales).where(and(
      eq(sales.tenantId, tenantId),
      eq(sales.status, 'approved'),
      sql`EXTRACT(YEAR FROM ${sales.saleDate}) = ${targetYear}`,
    )).groupBy(sales.paymentMethod)

    return {
      year: targetYear,
      summary: {
        totalSales: yearTotal,
        totalTransactions: yearCount,
        avgTicket: yearCount > 0 ? yearTotal / yearCount : 0,
      },
      monthlyData,
      topProductsByMonth,
      topProductsYear: topProductsYear.map(p => ({ ...p, totalQty: Number(p.totalQty), totalRevenue: Number(p.totalRevenue) })),
      paymentMethods,
    }
  })

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
