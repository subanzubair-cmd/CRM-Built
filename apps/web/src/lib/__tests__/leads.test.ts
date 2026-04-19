import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    property: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getLeadList, getLeadById } from '@/lib/leads'

describe('getLeadList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by leadType DIRECT_TO_SELLER and status ACTIVE for DTS', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getLeadList({ pipeline: 'dts' })

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadType: 'DIRECT_TO_SELLER',
          leadStatus: 'ACTIVE',
        }),
      })
    )
  })

  it('filters by leadType DIRECT_TO_AGENT and status ACTIVE for DTA', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getLeadList({ pipeline: 'dta' })

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadType: 'DIRECT_TO_AGENT',
          leadStatus: 'ACTIVE',
        }),
      })
    )
  })

  it('applies optional search filter to address and contact', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getLeadList({ pipeline: 'dts', search: 'Dallas' })

    const call = (prisma.property.findMany as any).mock.calls[0][0]
    expect(call.where.OR).toBeDefined()
  })

  it('returns total count alongside rows', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([{ id: '1' }])
    ;(prisma.property.count as any).mockResolvedValue(1)

    const result = await getLeadList({ pipeline: 'dts' })

    expect(result.total).toBe(1)
    expect(result.rows).toHaveLength(1)
  })

  it('applies isHot: true filter when requested', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getLeadList({ pipeline: 'dts', isHot: true })

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isHot: true }),
      })
    )
  })

  it('paginates with correct skip for page 2', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getLeadList({ pipeline: 'dts', page: 2, pageSize: 50 })

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50 })
    )
  })
})

describe('getLeadById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches property with contacts, notes, tasks, and activity', async () => {
    ;(prisma.property.findUnique as any).mockResolvedValue(null)

    await getLeadById('abc-123')

    expect(prisma.property.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'abc-123' },
        include: expect.objectContaining({
          contacts: expect.anything(),
          notes: expect.anything(),
          tasks: expect.anything(),
          activityLogs: expect.anything(),
        }),
      })
    )
  })
})
