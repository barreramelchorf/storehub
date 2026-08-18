import type { FastifyInstance } from 'fastify'
import { db, sales, saleItems, products, users, categories } from '@storehub/db'
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

    // Day of week stats per month
    const dayOfWeekByMonthRaw = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM ${sales.saleDate})::int`,
      dayOfWeek: sql<number>`EXTRACT(DOW FROM ${sales.saleDate})::int`,
      totalSales: sql<number>`COALESCE(SUM(${sales.total}::numeric), 0)`,
      daysCount: sql<number>`COUNT(DISTINCT DATE(${sales.saleDate}))::int`,
    }).from(sales).where(and(
      eq(sales.tenantId, tenantId),
      eq(sales.status, 'approved'),
      sql`EXTRACT(YEAR FROM ${sales.saleDate}) = ${targetYear}`,
    )).groupBy(sql`EXTRACT(MONTH FROM ${sales.saleDate})`, sql`EXTRACT(DOW FROM ${sales.saleDate})`)

    const dayOfWeekByMonth: Record<number, Array<{ dayOfWeek: number; avgSales: number }>> = {}
    for (const row of dayOfWeekByMonthRaw) {
      if (!dayOfWeekByMonth[row.month]) dayOfWeekByMonth[row.month] = []
      dayOfWeekByMonth[row.month].push({ dayOfWeek: row.dayOfWeek, avgSales: row.daysCount > 0 ? Number(row.totalSales) / row.daysCount : 0 })
    }
    for (const m of months) {
      if (!dayOfWeekByMonth[m]) dayOfWeekByMonth[m] = []
    }

    // Top 3 and bottom 3 days per month
    const topBottomDaysRaw = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM ${sales.saleDate})::int`,
      date: sql<string>`DATE(${sales.saleDate})`,
      total: sql<number>`COALESCE(SUM(${sales.total}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
    }).from(sales).where(and(
      eq(sales.tenantId, tenantId),
      eq(sales.status, 'approved'),
      sql`EXTRACT(YEAR FROM ${sales.saleDate}) = ${targetYear}`,
    )).groupBy(sql`EXTRACT(MONTH FROM ${sales.saleDate})`, sql`DATE(${sales.saleDate})`)
      .orderBy(sql`EXTRACT(MONTH FROM ${sales.saleDate})`, desc(sql`SUM(${sales.total}::numeric)`))

    const topDaysByMonth: Record<number, Array<{ date: string; total: number; count: number }>> = {}
    const bottomDaysByMonth: Record<number, Array<{ date: string; total: number; count: number }>> = {}
    for (const row of topBottomDaysRaw) {
      if (!topDaysByMonth[row.month]) topDaysByMonth[row.month] = []
      if (topDaysByMonth[row.month].length < 3) {
        topDaysByMonth[row.month].push({ date: row.date, total: Number(row.total), count: row.count })
      }
    }
    // Reverse sort for bottom days
    const bottomSorted = [...topBottomDaysRaw].sort((a, b) => Number(a.total) - Number(b.total))
    for (const row of bottomSorted) {
      if (!bottomDaysByMonth[row.month]) bottomDaysByMonth[row.month] = []
      if (bottomDaysByMonth[row.month].length < 3) {
        bottomDaysByMonth[row.month].push({ date: row.date, total: Number(row.total), count: row.count })
      }
    }
    for (const m of months) {
      if (!topDaysByMonth[m]) topDaysByMonth[m] = []
      if (!bottomDaysByMonth[m]) bottomDaysByMonth[m] = []
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

    // Sales by day of week for the year
    const salesByDayOfWeekYear = await db.select({
      dayOfWeek: sql<number>`EXTRACT(DOW FROM ${sales.saleDate})::int`,
      totalSales: sql<number>`COALESCE(SUM(${sales.total}::numeric), 0)`,
      totalTransactions: sql<number>`COUNT(*)::int`,
      daysCount: sql<number>`COUNT(DISTINCT DATE(${sales.saleDate}))::int`,
    }).from(sales).where(and(
      eq(sales.tenantId, tenantId),
      eq(sales.status, 'approved'),
      sql`EXTRACT(YEAR FROM ${sales.saleDate}) = ${targetYear}`,
    )).groupBy(sql`EXTRACT(DOW FROM ${sales.saleDate})`)
      .orderBy(sql`EXTRACT(DOW FROM ${sales.saleDate})`)

    return {
      year: targetYear,
      summary: {
        totalSales: yearTotal,
        totalTransactions: yearCount,
        avgTicket: yearCount > 0 ? yearTotal / yearCount : 0,
      },
      monthlyData,
      topProductsByMonth,
      dayOfWeekByMonth,
      topDaysByMonth,
      bottomDaysByMonth,
      topProductsYear: topProductsYear.map(p => ({ ...p, totalQty: Number(p.totalQty), totalRevenue: Number(p.totalRevenue) })),
      salesByDayOfWeek: salesByDayOfWeekYear.map(d => ({ ...d, totalSales: Number(d.totalSales), avgSales: d.daysCount > 0 ? Number(d.totalSales) / d.daysCount : 0 })),
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

    // Sales by hour (use createdAt for actual time, converted to business timezone)
    const salesByHour = await db.select({
      hour: sql<number>`EXTRACT(HOUR FROM ${sales.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')`,
      total: sql<number>`SUM(${sales.total}::numeric)`,
      count: sql<number>`COUNT(*)`,
    }).from(sales).where(baseWhere)
      .groupBy(sql`EXTRACT(HOUR FROM ${sales.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')`)
      .orderBy(sql`EXTRACT(HOUR FROM ${sales.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')`)

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

    // Sales by employee
    const salesByEmployee = await db.select({
      userId: sales.userId,
      username: users.username,
      email: users.email,
      totalSales: sql<number>`COALESCE(SUM(${sales.total}::numeric), 0)`,
      totalTips: sql<number>`COALESCE(SUM(${sales.tip}::numeric), 0)`,
      totalTransactions: sql<number>`COUNT(*)::int`,
    }).from(sales)
      .innerJoin(users, eq(sales.userId, users.id))
      .where(baseWhere)
      .groupBy(sales.userId, users.username, users.email)
      .orderBy(desc(sql`SUM(${sales.total}::numeric)`))

    // Top modifiers (from JSONB in sale_items)
    const topModifiers = await db.execute(sql`
      SELECT
        m->>'name' as name,
        SUM((m->>'price')::numeric) as total_revenue,
        COUNT(*)::int as times_sold
      FROM ${saleItems}
      INNER JOIN ${sales} ON ${saleItems.saleId} = ${sales.id}
      CROSS JOIN jsonb_array_elements(${saleItems.modifiers}) AS m
      WHERE ${sales.tenantId} = ${tenantId}
        AND ${sales.status} = 'approved'
        AND ${sales.saleDate} >= ${dateFrom.toISOString()}
        AND ${sales.saleDate} <= ${dateTo.toISOString()}
      GROUP BY m->>'name'
      ORDER BY times_sold DESC
      LIMIT 10
    `)

    // Sales by day of week (average per weekday: Mon, Tue, etc.)
    const salesByDayOfWeek = await db.select({
      dayOfWeek: sql<number>`EXTRACT(DOW FROM ${sales.saleDate})::int`,
      totalSales: sql<number>`COALESCE(SUM(${sales.total}::numeric), 0)`,
      totalTransactions: sql<number>`COUNT(*)::int`,
      daysCount: sql<number>`COUNT(DISTINCT DATE(${sales.saleDate}))::int`,
    }).from(sales).where(baseWhere)
      .groupBy(sql`EXTRACT(DOW FROM ${sales.saleDate})`)
      .orderBy(sql`EXTRACT(DOW FROM ${sales.saleDate})`)

    // Top 3 days with most sales in the period
    const topDays = await db.select({
      date: sql<string>`DATE(${sales.saleDate})`,
      total: sql<number>`COALESCE(SUM(${sales.total}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
    }).from(sales).where(baseWhere)
      .groupBy(sql`DATE(${sales.saleDate})`)
      .orderBy(desc(sql`SUM(${sales.total}::numeric)`))
      .limit(3)

    // Bottom 3 days with least sales in the period
    const bottomDays = await db.select({
      date: sql<string>`DATE(${sales.saleDate})`,
      total: sql<number>`COALESCE(SUM(${sales.total}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
    }).from(sales).where(baseWhere)
      .groupBy(sql`DATE(${sales.saleDate})`)
      .orderBy(sql`SUM(${sales.total}::numeric)`)
      .limit(3)

    return {
      summary: salesData[0],
      previousPeriod: prevData[0],
      salesByDay,
      salesByPayment,
      salesByHour,
      salesByDayOfWeek: salesByDayOfWeek.map(d => ({ ...d, totalSales: Number(d.totalSales), avgSales: d.daysCount > 0 ? Number(d.totalSales) / d.daysCount : 0 })),
      topDays: topDays.map(d => ({ ...d, total: Number(d.total) })),
      bottomDays: bottomDays.map(d => ({ ...d, total: Number(d.total) })),
      salesByEmployee: salesByEmployee.map(e => ({ ...e, totalSales: Number(e.totalSales), totalTips: Number(e.totalTips) })),
      topProducts,
      topModifiers: topModifiers ?? [],
      lowStock,
      period: { from: dateFrom, to: dateTo },
    }
  })

  app.get('/api/admin/analytics/categories', { preHandler: requirePermission('analytics.view') }, async (request) => {
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

    // 1. Sales by category
    const salesByCategoryRaw = await db.select({
      categoryId: categories.id,
      categoryName: categories.name,
      totalRevenue: sql<number>`COALESCE(SUM(${saleItems.subtotal}::numeric), 0)`,
      totalQuantity: sql<number>`COALESCE(SUM(${saleItems.quantity}::numeric), 0)`,
      totalTransactions: sql<number>`COUNT(DISTINCT ${sales.id})`,
    }).from(categories)
      .innerJoin(products, and(eq(products.categoryId, categories.id), eq(products.tenantId, tenantId)))
      .innerJoin(saleItems, eq(saleItems.productId, products.id))
      .innerJoin(sales, and(eq(saleItems.saleId, sales.id), baseWhere))
      .where(and(
        eq(categories.tenantId, tenantId),
        eq(categories.active, true),
      ))
      .groupBy(categories.id, categories.name)
      .orderBy(desc(sql`SUM(${saleItems.subtotal}::numeric)`))

    const grandTotal = salesByCategoryRaw.reduce((acc, row) => acc + Number(row.totalRevenue), 0)

    const salesByCategory = salesByCategoryRaw.map(row => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      totalRevenue: Number(row.totalRevenue),
      totalQuantity: Number(row.totalQuantity),
      totalTransactions: Number(row.totalTransactions),
      percentage: grandTotal > 0 ? Number(((Number(row.totalRevenue) / grandTotal) * 100).toFixed(2)) : 0,
    }))

    // 2. Top products by category (top 5 per category by revenue)
    const topProductsRaw = await db.select({
      categoryId: products.categoryId,
      productId: products.id,
      name: products.name,
      totalQty: sql<number>`COALESCE(SUM(${saleItems.quantity}::numeric), 0)`,
      totalRevenue: sql<number>`COALESCE(SUM(${saleItems.subtotal}::numeric), 0)`,
    }).from(saleItems)
      .innerJoin(sales, and(eq(saleItems.saleId, sales.id), baseWhere))
      .innerJoin(products, and(eq(saleItems.productId, products.id), eq(products.tenantId, tenantId)))
      .innerJoin(categories, and(eq(products.categoryId, categories.id), eq(categories.tenantId, tenantId), eq(categories.active, true)))
      .groupBy(products.categoryId, products.id, products.name)
      .orderBy(desc(sql`SUM(${saleItems.subtotal}::numeric)`))

    const topProductsByCategory: Record<string, Array<{ productId: string; name: string; totalQty: number; totalRevenue: number }>> = {}
    for (const row of topProductsRaw) {
      const catId = row.categoryId!
      if (!topProductsByCategory[catId]) topProductsByCategory[catId] = []
      if (topProductsByCategory[catId].length < 5) {
        topProductsByCategory[catId].push({
          productId: row.productId,
          name: row.name,
          totalQty: Number(row.totalQty),
          totalRevenue: Number(row.totalRevenue),
        })
      }
    }

    // 3. Bottom products by category (bottom 5 per category by revenue, must have at least 1 sale)
    const bottomProductsRaw = await db.select({
      categoryId: products.categoryId,
      productId: products.id,
      name: products.name,
      totalQty: sql<number>`COALESCE(SUM(${saleItems.quantity}::numeric), 0)`,
      totalRevenue: sql<number>`COALESCE(SUM(${saleItems.subtotal}::numeric), 0)`,
    }).from(saleItems)
      .innerJoin(sales, and(eq(saleItems.saleId, sales.id), baseWhere))
      .innerJoin(products, and(eq(saleItems.productId, products.id), eq(products.tenantId, tenantId)))
      .innerJoin(categories, and(eq(products.categoryId, categories.id), eq(categories.tenantId, tenantId), eq(categories.active, true)))
      .groupBy(products.categoryId, products.id, products.name)
      .orderBy(sql`SUM(${saleItems.subtotal}::numeric)`)

    const bottomProductsByCategory: Record<string, Array<{ productId: string; name: string; totalQty: number; totalRevenue: number }>> = {}
    for (const row of bottomProductsRaw) {
      const catId = row.categoryId!
      if (!bottomProductsByCategory[catId]) bottomProductsByCategory[catId] = []
      if (bottomProductsByCategory[catId].length < 5) {
        bottomProductsByCategory[catId].push({
          productId: row.productId,
          name: row.name,
          totalQty: Number(row.totalQty),
          totalRevenue: Number(row.totalRevenue),
        })
      }
    }

    // 4. Category trend: avg revenue per transaction
    const categoryTrend = salesByCategory.map(cat => ({
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      avgRevenuePerTransaction: cat.totalTransactions > 0 ? Number((cat.totalRevenue / cat.totalTransactions).toFixed(2)) : 0,
    }))

    // 5. Inventory by category
    const inventoryByCategoryRaw = await db.select({
      categoryId: categories.id,
      categoryName: categories.name,
      totalProducts: sql<number>`COUNT(${products.id})`,
      totalStock: sql<number>`COALESCE(SUM(${products.stock}::numeric), 0)`,
      lowStockCount: sql<number>`COUNT(CASE WHEN ${products.stock} <= ${products.minStock} THEN 1 END)`,
    }).from(categories)
      .innerJoin(products, and(eq(products.categoryId, categories.id), eq(products.tenantId, tenantId), eq(products.active, true)))
      .where(and(
        eq(categories.tenantId, tenantId),
        eq(categories.active, true),
      ))
      .groupBy(categories.id, categories.name)

    const inventoryByCategory = inventoryByCategoryRaw.map(row => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      totalProducts: Number(row.totalProducts),
      totalStock: Number(row.totalStock),
      lowStockCount: Number(row.lowStockCount),
    }))

    return {
      salesByCategory,
      topProductsByCategory,
      bottomProductsByCategory,
      categoryTrend,
      inventoryByCategory,
      period: { from: dateFrom, to: dateTo },
    }
  })
}
