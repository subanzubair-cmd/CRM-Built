import { vi, describe, it, expect, beforeEach } from 'vitest'

// Prisma mock — Property still on Prisma until Phase 6, so getCampaignById's
// property lookup goes through here.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    property: { findMany: vi.fn() },
  },
}))

// Sequelize mock — Phase 4 ports Campaign + CampaignStep + CampaignEnrollment.
vi.mock('@crm/database', () => ({
  Campaign: {
    findAll: vi.fn(),
    count: vi.fn(),
    findByPk: vi.fn(),
  },
  CampaignStep: {},
  CampaignEnrollment: {
    findAll: vi.fn(),
  },
  Market: {},
  Op: { iLike: Symbol('iLike'), in: Symbol('in') },
  literal: (sql: string) => sql,
}))

import { Campaign, CampaignEnrollment } from '@crm/database'
import { getCampaignList, getCampaignById } from '../campaigns'

describe('getCampaignList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns paginated rows and total', async () => {
    const row = {
      toJSON: () => ({
        id: 'c1',
        name: 'Follow-Up Drip',
        type: 'DRIP',
        status: 'ACTIVE',
        stepCount: 0,
        enrollmentCount: 0,
      }),
    }
    vi.mocked(Campaign.findAll).mockResolvedValue([row as any])
    vi.mocked(Campaign.count).mockResolvedValue(1)

    const result = await getCampaignList()
    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.rows[0]._count).toEqual({ steps: 0, enrollments: 0 })
  })

  it('applies type filter', async () => {
    vi.mocked(Campaign.findAll).mockResolvedValue([])
    vi.mocked(Campaign.count).mockResolvedValue(0)

    await getCampaignList({ type: 'BROADCAST' })
    expect(Campaign.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'BROADCAST' }),
      }),
    )
  })
})

describe('getCampaignById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns campaign with steps and enrollments', async () => {
    vi.mocked(Campaign.findByPk).mockResolvedValue({
      toJSON: () => ({
        id: 'c1',
        name: 'Test',
        steps: [{ id: 's1', order: 1, channel: 'SMS', body: 'Hi' }],
      }),
    } as any)
    vi.mocked(CampaignEnrollment.findAll).mockResolvedValue([])

    const result = await getCampaignById('c1')
    expect(result?.steps).toHaveLength(1)
  })

  it('returns null for unknown id', async () => {
    vi.mocked(Campaign.findByPk).mockResolvedValue(null)
    const result = await getCampaignById('nonexistent')
    expect(result).toBeNull()
  })
})
