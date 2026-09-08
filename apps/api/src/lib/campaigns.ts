/**
 * Campaign discount calculation engine.
 * Shared between POS preview (public endpoint) and sale creation (source of truth).
 *
 * Given the cart items and the set of active campaigns (with their eligible
 * product IDs resolved), computes the total discount and a per-campaign breakdown.
 */

export interface CampaignLine {
  productId: string
  unitPrice: number
  quantity: number
}

export interface ResolvedCampaign {
  id: string
  name: string
  type: 'nxm' | 'percentage'
  config: any // { buy, pay } | { percent }
  priority: number
  // Set of product IDs this campaign applies to (already resolved from
  // direct product links + category links)
  eligibleProductIds: Set<string>
}

export interface CampaignResult {
  campaignId: string
  name: string
  type: string
  discount: number
}

/**
 * Expand cart lines into individual units (one entry per unit) for a given
 * set of eligible products, sorted by unit price descending.
 */
function eligibleUnits(items: CampaignLine[], eligible: Set<string>): number[] {
  const units: number[] = []
  for (const item of items) {
    if (!eligible.has(item.productId)) continue
    for (let i = 0; i < item.quantity; i++) units.push(item.unitPrice)
  }
  return units.sort((a, b) => b - a) // most expensive first
}

/**
 * Compute the discount for a single campaign against the cart.
 */
function computeCampaignDiscount(campaign: ResolvedCampaign, items: CampaignLine[]): number {
  const units = eligibleUnits(items, campaign.eligibleProductIds)
  if (units.length === 0) return 0

  if (campaign.type === 'nxm') {
    const buy = Number(campaign.config?.buy)
    const pay = Number(campaign.config?.pay)
    if (!buy || !pay || buy <= pay) return 0

    // Each group of `buy` units → the cheapest `(buy - pay)` are free.
    // Units are sorted desc, so within each group the cheapest ones are at the end.
    const freePerGroup = buy - pay
    const groups = Math.floor(units.length / buy)
    let discount = 0
    for (let g = 0; g < groups; g++) {
      // The group occupies positions [g*buy, g*buy + buy). The cheapest
      // `freePerGroup` within that group are the last ones (since sorted desc).
      const groupEnd = g * buy + buy
      for (let k = 0; k < freePerGroup; k++) {
        discount += units[groupEnd - 1 - k]
      }
    }
    return Math.round(discount * 100) / 100
  }

  if (campaign.type === 'percentage') {
    const percent = Number(campaign.config?.percent)
    if (!percent) return 0
    const eligibleTotal = units.reduce((s, u) => s + u, 0)
    return Math.round(eligibleTotal * (percent / 100) * 100) / 100
  }

  return 0
}

/**
 * Compute all applicable campaigns for the cart on a given day.
 * Each cart unit can only benefit from ONE campaign — campaigns are applied
 * in priority order (highest first), and units already discounted by a
 * higher-priority campaign are not reused.
 *
 * @param dayOfWeek 0-6 (0=Sunday). Campaigns with empty daysOfWeek apply always.
 */
export function calculateCampaigns(
  items: CampaignLine[],
  campaigns: ResolvedCampaign[],
  dayOfWeek: number,
  campaignDays: Record<string, number[]>,
): { totalDiscount: number; results: CampaignResult[] } {
  // Sort by priority desc so higher priority campaigns claim units first
  const sorted = [...campaigns].sort((a, b) => b.priority - a.priority)

  // Track remaining units per product (mutable copy)
  const remaining = new Map<string, number>()
  for (const item of items) {
    remaining.set(item.productId, (remaining.get(item.productId) ?? 0) + item.quantity)
  }

  const results: CampaignResult[] = []
  let totalDiscount = 0

  for (const campaign of sorted) {
    // Day-of-week filter
    const days = campaignDays[campaign.id] ?? []
    if (days.length > 0 && !days.includes(dayOfWeek)) continue

    // Build the sub-cart of still-available eligible units
    const subItems: CampaignLine[] = []
    for (const item of items) {
      if (!campaign.eligibleProductIds.has(item.productId)) continue
      const avail = remaining.get(item.productId) ?? 0
      if (avail <= 0) continue
      subItems.push({ productId: item.productId, unitPrice: item.unitPrice, quantity: avail })
    }
    if (subItems.length === 0) continue

    const discount = computeCampaignDiscount(campaign, subItems)
    if (discount <= 0) continue

    // Consume the units this campaign used (approximation: consume all eligible
    // units it touched so they can't be double-counted by lower-priority campaigns)
    for (const item of subItems) {
      remaining.set(item.productId, 0)
    }

    results.push({ campaignId: campaign.id, name: campaign.name, type: campaign.type, discount })
    totalDiscount += discount
  }

  return { totalDiscount: Math.round(totalDiscount * 100) / 100, results }
}
