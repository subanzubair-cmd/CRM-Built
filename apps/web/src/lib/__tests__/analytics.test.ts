import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    property: {
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getAnalyticsOverview } from '../analytics'

describe('getAnalyticsOverview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns expected shape with correct mapped values', async () => {
    vi.mocked(prisma.property.count).mockResolvedValue(12)
    vi.mocked(prisma.property.aggregate).mockResolvedValue({
      _sum: { offerPrice: '1500000' },
    } as any)
    vi.mocked(prisma.property.groupBy).mockResolvedValue([
      { activeLeadStage: 'NEW_LEAD', _count: { activeLeadStage: 5 } },
    ] as any)

    const result = await getAnalyticsOverview()

    expect(result.activeLeads).toBe(12)
    expect(result.newLeadsThisMonth).toBe(12)
    expect(result.soldThisYear).toBe(12)
    expect(result.revenueThisYear).toBe(1500000)
    expect(result.pipelineStages).toHaveLength(1)
    expect(result.weeklyVolume).toHaveLength(8)
    expect(result.weeklyVolume.every((v) => v === 12)).toBe(true)
  })

  it('returns zero revenue when offerPrice sum is null', async () => {
    vi.mocked(prisma.property.count).mockResolvedValue(0)
    vi.mocked(prisma.property.aggregate).mockResolvedValue({
      _sum: { offerPrice: null },
    } as any)
    vi.mocked(prisma.property.groupBy).mockResolvedValue([] as any)

    const result = await getAnalyticsOverview()
    expect(result.revenueThisYear).toBe(0)
    expect(result.exitBreakdown).toHaveLength(0)
  })
})
