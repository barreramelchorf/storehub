import { db } from '@storehub/db'
import type { ResolvedCampaign } from './campaigns.js'

/**
 * Load all active campaigns for a tenant and resolve their eligible product IDs
 * (direct product links + products belonging to linked categories).
 * Returns the resolved campaigns plus a map of campaignId → daysOfWeek.
 */
export async function loadActiveCampaigns(tenantId: string): Promise<{
  resolved: ResolvedCampaign[]
  campaignDays: Record<string, number[]>
}> {
  const rows = await db.query.campaigns.findMany({
    where: (c, { eq, and }) => and(eq(c.tenantId, tenantId), eq(c.active, true)),
    with: { productLinks: true, categoryLinks: true },
  })

  if (rows.length === 0) return { resolved: [], campaignDays: {} }

  // Collect all category IDs used across campaigns to resolve their products in one query
  const allCategoryIds = [...new Set(rows.flatMap(c => c.categoryLinks.map((l: any) => l.categoryId)))]
  const productsByCategory: Record<string, string[]> = {}
  if (allCategoryIds.length > 0) {
    const prods = await db.query.products.findMany({
      where: (p, { inArray, and, eq }) => and(inArray(p.categoryId, allCategoryIds), eq(p.tenantId, tenantId)),
      columns: { id: true, categoryId: true },
    })
    for (const p of prods) {
      (productsByCategory[p.categoryId] ??= []).push(p.id)
    }
  }

  const resolved: ResolvedCampaign[] = []
  const campaignDays: Record<string, number[]> = {}

  for (const c of rows) {
    const eligible = new Set<string>()
    for (const l of c.productLinks as any[]) eligible.add(l.productId)
    for (const l of c.categoryLinks as any[]) {
      for (const pid of productsByCategory[l.categoryId] ?? []) eligible.add(pid)
    }
    if (eligible.size === 0) continue

    resolved.push({
      id: c.id,
      name: c.name,
      type: c.type as 'nxm' | 'percentage',
      config: c.config,
      priority: c.priority,
      eligibleProductIds: eligible,
    })
    campaignDays[c.id] = (c.daysOfWeek as number[]) ?? []
  }

  return { resolved, campaignDays }
}
