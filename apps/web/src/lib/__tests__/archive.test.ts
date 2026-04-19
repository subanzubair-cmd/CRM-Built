import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    property: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getSoldList, getRentalList } from '@/lib/archive'

describe('getSoldList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by propertyStatus SOLD', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getSoldList({})

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyStatus: 'SOLD' }),
      })
    )
  })

  it('returns rows and total', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([{ id: '1' }])
    ;(prisma.property.count as any).mockResolvedValue(1)

    const result = await getSoldList({})

    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('orders by soldAt desc', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getSoldList({})

    const call = (prisma.property.findMany as any).mock.calls[0][0]
    expect(call.orderBy).toEqual({ soldAt: 'desc' })
  })

  it('paginates with correct skip for page 2', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getSoldList({ page: 2, pageSize: 50 })

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50 })
    )
  })
})

describe('getRentalList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by propertyStatus RENTAL', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getRentalList({})

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyStatus: 'RENTAL' }),
      })
    )
  })

  it('returns page and pageSize in result', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    const result = await getRentalList({ page: 3, pageSize: 25 })

    expect(result.page).toBe(3)
    expect(result.pageSize).toBe(25)
  })
})
