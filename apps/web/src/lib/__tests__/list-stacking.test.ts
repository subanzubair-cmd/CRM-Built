import { vi, describe, it, expect, beforeEach } from 'vitest'

// Prisma mock — Property still on Prisma until Phase 6.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    property: { findMany: vi.fn() },
  },
}))

// Sequelize mock — ListStackSource migrated in Phase 2.
vi.mock('@crm/database', () => ({
  ListStackSource: {
    findAll: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import { ListStackSource } from '@crm/database'
import { getListSources, getOverlapProperties } from '../list-stacking'

describe('getListSources', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns sources ordered by createdAt desc', async () => {
    vi.mocked(ListStackSource.findAll).mockResolvedValue([
      { id: 's1', name: 'Tax Delinquent Q1', totalImported: 150, tags: [], description: null, createdAt: new Date(), updatedAt: new Date() },
    ] as any)
    const result = await getListSources()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Tax Delinquent Q1')
  })
})

describe('getOverlapProperties', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array when fewer than 2 sources exist', async () => {
    vi.mocked(ListStackSource.findAll).mockResolvedValue([{ id: 's1' }] as any)
    const result = await getOverlapProperties()
    expect(result).toHaveLength(0)
    expect(prisma.property.findMany).not.toHaveBeenCalled()
  })

  it('returns only properties tagged with 2+ list: tags', async () => {
    vi.mocked(ListStackSource.findAll).mockResolvedValue([
      { id: 's1' }, { id: 's2' },
    ] as any)
    vi.mocked(prisma.property.findMany).mockResolvedValue([
      { id: 'p1', streetAddress: '123 Main', tags: ['list:s1', 'list:s2'] },
      { id: 'p2', streetAddress: '456 Oak', tags: ['list:s1'] }, // only 1 list tag — excluded
    ] as any)

    const result = await getOverlapProperties()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p1')
  })
})
