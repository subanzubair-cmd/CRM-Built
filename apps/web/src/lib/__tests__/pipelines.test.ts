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
import { getTmList, getInventoryList, getDispoList, getPropertyById } from '@/lib/pipelines'

describe('getTmList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by propertyStatus IN_TM', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getTmList({})

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyStatus: 'IN_TM' }),
      })
    )
  })

  it('returns rows and total', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([{ id: '1' }])
    ;(prisma.property.count as any).mockResolvedValue(1)

    const result = await getTmList({})

    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('paginates with correct skip for page 2', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getTmList({ page: 2, pageSize: 50 })

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50 })
    )
  })
})

describe('getInventoryList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by propertyStatus IN_INVENTORY', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getInventoryList({})

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyStatus: 'IN_INVENTORY' }),
      })
    )
  })
})

describe('getDispoList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by inDispo true', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getDispoList({})

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ inDispo: true }),
      })
    )
  })
})

describe('getPropertyById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches with contacts, notes, tasks, buyerMatches', async () => {
    ;(prisma.property.findUnique as any).mockResolvedValue(null)

    await getPropertyById('xyz-789')

    expect(prisma.property.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'xyz-789' },
        include: expect.objectContaining({
          contacts: expect.anything(),
          notes: expect.anything(),
          tasks: expect.anything(),
          buyerMatches: expect.anything(),
        }),
      })
    )
  })
})
