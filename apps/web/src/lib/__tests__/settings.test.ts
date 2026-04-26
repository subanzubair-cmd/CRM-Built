import { vi, describe, it, expect, beforeEach } from 'vitest'

// Prisma mock — Campaign + LeadCampaign still on Prisma until Phase 4.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    campaign: { findMany: vi.fn() },
    leadCampaign: { findMany: vi.fn() },
  },
}))

// Sequelize mock — User, Role, UserRoleConfig, Market migrated to Sequelize.
vi.mock('@crm/database', () => ({
  Market: { findAll: vi.fn() },
  User: { findAll: vi.fn() },
  Role: { findAll: vi.fn() },
  UserRoleConfig: { findAll: vi.fn() },
  literal: (sql: string) => sql,
}))

import { Market, User, Role, UserRoleConfig } from '@crm/database'
import { getUserList, getMarketList, getRoleList } from '../settings'

describe('getUserList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns users with their role', async () => {
    const userInstance = {
      id: 'u1',
      toJSON: () => ({
        id: 'u1',
        name: 'Alice',
        email: 'alice@test.com',
        status: 'ACTIVE',
        role: { id: 'r1', name: 'Admin' },
      }),
    }
    vi.mocked(User.findAll).mockResolvedValue([userInstance as any])
    vi.mocked(UserRoleConfig.findAll).mockResolvedValue([])
    const result = await getUserList()
    expect(result).toHaveLength(1)
    expect(result[0].role.name).toBe('Admin')
    expect(result[0].roleConfigs).toEqual([])
  })

  it('returns empty array when no users', async () => {
    vi.mocked(User.findAll).mockResolvedValue([])
    vi.mocked(UserRoleConfig.findAll).mockResolvedValue([])
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
    vi.mocked(Role.findAll).mockResolvedValue([
      { id: 'r1', name: 'Admin' },
      { id: 'r2', name: 'Agent' },
    ] as any)
    const result = await getRoleList()
    expect(result).toHaveLength(2)
  })
})
