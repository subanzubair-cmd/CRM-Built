import { vi, describe, it, expect, beforeEach } from 'vitest'
import { scoreCriteria } from '../buyer-matching'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    property: { findUniqueOrThrow: vi.fn() },
    buyer: { findMany: vi.fn() },
    buyerMatch: { upsert: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { runBuyerMatching } from '../buyer-matching'

const baseCriteria = {
  markets: [] as string[],
  propertyTypes: [] as string[],
  minBeds: null, maxBeds: null,
  minBaths: null, maxBaths: null,
  minPrice: null, maxPrice: null,
  minSqft: null, maxSqft: null,
  minArv: null, maxArv: null,
  maxRepairs: null,
}

const baseProperty = {
  marketName: 'DFW',
  propertyType: null as string | null,
  bedrooms: null as number | null,
  bathrooms: null as number | null,
  askingPrice: null as number | null,
  sqft: null as number | null,
  arv: null as number | null,
  repairEstimate: null as number | null,
}

describe('scoreCriteria', () => {
  it('returns 0 when market does not match (hard disqualifier)', () => {
    const score = scoreCriteria(
      { ...baseCriteria, markets: ['DFW'] },
      { ...baseProperty, marketName: 'Houston' }
    )
    expect(score).toBe(0)
  })

  it('returns 0 when property type does not match (hard disqualifier)', () => {
    const score = scoreCriteria(
      { ...baseCriteria, markets: ['DFW'], propertyTypes: ['Single Family'] },
      { ...baseProperty, marketName: 'DFW', propertyType: 'Multi-Family' }
    )
    expect(score).toBe(0)
  })

  it('returns 100 when all criteria fully match', () => {
    const score = scoreCriteria(
      {
        markets: ['DFW'],
        propertyTypes: ['Single Family'],
        minBeds: 3, maxBeds: 5,
        minBaths: 2, maxBaths: 4,
        minPrice: 100000, maxPrice: 300000,
        minSqft: 1200, maxSqft: 2500,
        minArv: 150000, maxArv: 400000,
        maxRepairs: 50000,
      },
      {
        marketName: 'DFW',
        propertyType: 'Single Family',
        bedrooms: 4,
        bathrooms: 2,
        askingPrice: 200000,
        sqft: 1800,
        arv: 250000,
        repairEstimate: 30000,
      }
    )
    expect(score).toBe(100)
  })

  it('returns partial score when only market and price match', () => {
    // Market (20) + no type filter (10) + no beds/baths/sqft/arv (null props) + price (20) + no repair limit (10) = 60
    const score = scoreCriteria(
      { ...baseCriteria, markets: ['DFW'], minPrice: 100000, maxPrice: 300000 },
      { ...baseProperty, marketName: 'DFW', askingPrice: 200000 }
    )
    expect(score).toBe(60)
  })
})

describe('runBuyerMatching', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates BuyerMatch records for qualifying buyers', async () => {
    vi.mocked(prisma.property.findUniqueOrThrow).mockResolvedValue({
      id: 'prop1', bedrooms: 4, bathrooms: 2, sqft: 1800, askingPrice: 200000,
      arv: 250000, repairEstimate: 30000, propertyType: 'Single Family',
      market: { name: 'DFW' },
    } as any)
    vi.mocked(prisma.buyer.findMany).mockResolvedValue([{
      id: 'buyer1', isActive: true,
      criteria: [{
        ...baseCriteria,
        markets: ['DFW'], minPrice: 100000, maxPrice: 300000,
      }],
    }] as any)
    vi.mocked(prisma.buyerMatch.upsert).mockResolvedValue({} as any)

    const count = await runBuyerMatching('prop1')
    expect(count).toBe(1)
    expect(prisma.buyerMatch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { buyerId_propertyId: { buyerId: 'buyer1', propertyId: 'prop1' } },
        create: expect.objectContaining({ score: expect.any(Number) }),
      })
    )
  })

  it('skips buyers whose best criteria score is below threshold', async () => {
    vi.mocked(prisma.property.findUniqueOrThrow).mockResolvedValue({
      id: 'prop1', bedrooms: 2, bathrooms: 1, sqft: 800, askingPrice: 400000,
      arv: 200000, repairEstimate: 80000, propertyType: 'Multi-Family',
      market: { name: 'Houston' },
    } as any)
    vi.mocked(prisma.buyer.findMany).mockResolvedValue([{
      id: 'buyer1', isActive: true,
      criteria: [{ ...baseCriteria, markets: ['DFW'] }],
    }] as any)

    const count = await runBuyerMatching('prop1')
    expect(count).toBe(0)
    expect(prisma.buyerMatch.upsert).not.toHaveBeenCalled()
  })
})
