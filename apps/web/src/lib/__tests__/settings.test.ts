import { vi, describe, it, expect, beforeEach } from 'vitest'

// Prisma mock — still used for User, Role, Campaign etc. (not yet migrated).
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    role: { findMany: vi.fn() },
  },
}))

// Sequelize mock — Market migrated to Sequelize in Phase 2. We mock the
// model class's static `findAll` plus `toJSON()` on each row.
vi.mock('@crm/database', () => ({
  Market: {
    findAll: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import { Market } from '@crm/database'
import { getUserList, getMarketList, getRoleList } from '../settings'

describe('getUserList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns users with their role', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', name: 'Alice', email: 'alice@test.com', status: 'ACTIVE', role: { id: 'r1', name: 'Admin' } },
    ] as any)
    const result = await getUserList()
    expect(result).toHaveLength(1)
    expect(result[0].role.name).toBe('Admin')
  })

  it('returns empty array when no users', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any)
    const result = await getUserList()
    expect(result).toHaveLength(0)
  })
})

describe('getMarketList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns markets with property counts', async () => {
    // Each row simulates a Sequelize instance with toJSON returning the
    // shape our query produces (`propertyCount` from the literal subquery).
    const row = {
      toJSON: () => ({
        id: 'm1',
        name: 'DFW',
        state: 'TX',
        isActive: true,
        propertyCount: 42,
      }),
    }
    vi.mocked(Market.findAll).mockResolvedValue([row as any])
    const result = await getMarketList()
    expect(result[0]._count.properties).toBe(42)
  })
})

describe('getRoleList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns roles ordered by name', async () => {
    vi.mocked(prisma.role.findMany).mockResolvedValue([
      { id: 'r1', name: 'Admin' },
      { id: 'r2', name: 'Agent' },
    ] as any)
    const result = await getRoleList()
    expect(result).toHaveLength(2)
  })
})
