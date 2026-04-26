import {
  Property,
  Buyer,
  BuyerCriteria,
  BuyerMatch,
  Market,
} from '@crm/database'

export interface ScoringCriteria {
  markets: string[]
  propertyTypes: string[]
  minBeds: number | null
  maxBeds: number | null
  minBaths: number | null
  maxBaths: number | null
  minPrice: number | null
  maxPrice: number | null
  minSqft: number | null
  maxSqft: number | null
  minArv: number | null
  maxArv: number | null
  maxRepairs: number | null
}

export interface ScoringProperty {
  marketName: string
  propertyType: string | null
  bedrooms: number | null
  bathrooms: number | null
  askingPrice: number | null
  sqft: number | null
  arv: number | null
  repairEstimate: number | null
}

/** Pure scoring function — no DB. Returns 0–100. */
export function scoreCriteria(c: ScoringCriteria, p: ScoringProperty): number {
  let score = 0

  if (c.markets.length > 0 && !c.markets.includes(p.marketName)) return 0
  score += 20

  if (c.propertyTypes.length > 0 && p.propertyType != null) {
    if (!c.propertyTypes.includes(p.propertyType)) return 0
  }
  score += 10

  if (p.bedrooms != null) {
    const ok = (c.minBeds == null || p.bedrooms >= c.minBeds) &&
               (c.maxBeds == null || p.bedrooms <= c.maxBeds)
    if (ok) score += 10
  }

  if (p.bathrooms != null) {
    const b = Number(p.bathrooms)
    const ok = (c.minBaths == null || b >= Number(c.minBaths)) &&
               (c.maxBaths == null || b <= Number(c.maxBaths))
    if (ok) score += 10
  }

  if (p.askingPrice != null) {
    const pr = Number(p.askingPrice)
    const ok = (c.minPrice == null || pr >= Number(c.minPrice)) &&
               (c.maxPrice == null || pr <= Number(c.maxPrice))
    if (ok) score += 20
  }

  if (p.sqft != null) {
    const ok = (c.minSqft == null || p.sqft >= c.minSqft) &&
               (c.maxSqft == null || p.sqft <= c.maxSqft)
    if (ok) score += 10
  }

  if (p.arv != null) {
    const a = Number(p.arv)
    const ok = (c.minArv == null || a >= Number(c.minArv)) &&
               (c.maxArv == null || a <= Number(c.maxArv))
    if (ok) score += 10
  }

  if (c.maxRepairs == null) {
    score += 10
  } else if (p.repairEstimate != null) {
    if (Number(p.repairEstimate) <= Number(c.maxRepairs)) score += 10
  }

  return score
}

const MATCH_THRESHOLD = 40

/** Scores all active buyers against the given property, upserts BuyerMatch records. Returns match count. */
export async function runBuyerMatching(propertyId: string): Promise<number> {
  const propertyRow = await Property.findByPk(propertyId, {
    include: [{ model: Market, as: 'market' }],
  })
  if (!propertyRow) throw new Error(`Property ${propertyId} not found`)
  const property = propertyRow.get({ plain: true }) as any

  const buyerRows = await Buyer.findAll({
    where: { isActive: true },
    include: [{ model: BuyerCriteria, as: 'criteria', separate: true }],
  })
  const buyers = buyerRows.map((b) => b.get({ plain: true }) as any)

  const qualified: Array<{ buyerId: string; score: number }> = []

  for (const buyer of buyers) {
    let best = 0
    for (const c of (buyer.criteria ?? [])) {
      const s = scoreCriteria(
        {
          markets: c.markets ?? [],
          propertyTypes: c.propertyTypes ?? [],
          minBeds: c.minBeds,
          maxBeds: c.maxBeds,
          minBaths: c.minBaths != null ? Number(c.minBaths) : null,
          maxBaths: c.maxBaths != null ? Number(c.maxBaths) : null,
          minPrice: c.minPrice != null ? Number(c.minPrice) : null,
          maxPrice: c.maxPrice != null ? Number(c.maxPrice) : null,
          minSqft: c.minSqft,
          maxSqft: c.maxSqft,
          minArv: c.minArv != null ? Number(c.minArv) : null,
          maxArv: c.maxArv != null ? Number(c.maxArv) : null,
          maxRepairs: c.maxRepairs != null ? Number(c.maxRepairs) : null,
        },
        {
          marketName: property.market?.name ?? '',
          propertyType: property.propertyType,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms != null ? Number(property.bathrooms) : null,
          askingPrice: property.askingPrice != null ? Number(property.askingPrice) : null,
          sqft: property.sqft,
          arv: property.arv != null ? Number(property.arv) : null,
          repairEstimate: property.repairEstimate != null ? Number(property.repairEstimate) : null,
        }
      )
      if (s > best) best = s
    }
    if (best >= MATCH_THRESHOLD) qualified.push({ buyerId: buyer.id, score: best })
  }

  await Promise.all(
    qualified.map(async ({ buyerId, score }) => {
      const [match, created] = await BuyerMatch.findOrCreate({
        where: { buyerId, propertyId },
        defaults: { buyerId, propertyId, score, notified: false },
      })
      if (!created) {
        await match.update({ score })
      }
    })
  )

  return qualified.length
}
