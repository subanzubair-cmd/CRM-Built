import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    campaign: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getCampaignList, getCampaignById } from '../campaigns'

describe('getCampaignList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns paginated rows and total', async () => {
    vi.mocked(prisma.campaign.findMany).mockResolvedValue([
      { id: 'c1', name: 'Follow-Up Drip', type: 'DRIP', status: 'ACTIVE' },
    ] as any)
    vi.mocked(prisma.campaign.count).mockResolvedValue(1)

    const result = await getCampaignList()
    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('applies type filter', async () => {
    vi.mocked(prisma.campaign.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.campaign.count).mockResolvedValue(0)

    await getCampaignList({ type: 'BROADCAST' })
    expect(prisma.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'BROADCAST' }) })
    )
  })
})

describe('getCampaignById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns campaign with steps and enrollments', async () => {
    vi.mocked(prisma.campaign.findUnique).mockResolvedValue({
      id: 'c1',
      name: 'Test',
      steps: [{ id: 's1', order: 1, channel: 'SMS', body: 'Hi' }],
      enrollments: [],
    } as any)

    const result = await getCampaignById('c1')
    expect(result?.steps).toHaveLength(1)
  })

  it('returns null for unknown id', async () => {
    vi.mocked(prisma.campaign.findUnique).mockResolvedValue(null)
    const result = await getCampaignById('nonexistent')
    expect(result).toBeNull()
  })
})
