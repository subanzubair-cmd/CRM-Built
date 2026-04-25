import { prisma } from '@/lib/prisma'
import { Market, literal } from '@crm/database'

export async function getUserList() {
  return prisma.user.findMany({
    include: {
      role: { select: { id: true, name: true, permissions: true } },
      // All UserRoleConfig entries so the table can render every role the
      // user holds, not just the primary-label role on User.roleId.
      roleConfigs: {
        select: {
          roleId: true,
          role: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  })
}

export async function getCampaignListSimple() {
  return prisma.campaign.findMany({
    select: { id: true, name: true, marketId: true, status: true },
    where: { status: { in: ['ACTIVE', 'DRAFT'] } },
    orderBy: { name: 'asc' },
  })
}

/**
 * Thin LeadCampaign list used by the user-management screens to populate
 * role-assignment dropdowns. Preloaded SSR on the settings page so the
 * EditUser/AddUser panels don't need a separate client-side fetch.
 */
export async function getLeadCampaignListSimple() {
  return prisma.leadCampaign.findMany({
    select: { id: true, name: true, type: true },
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })
}

export async function getMarketList() {
  // Markets moved to Sequelize in Phase 2. The original Prisma version
  // included `_count: { select: { properties: true } }` — emulated here
  // via a correlated-subquery attribute so the response shape is
  // unchanged for the settings UI.
  const markets = await Market.findAll({
    order: [['name', 'ASC']],
    attributes: {
      include: [
        [
          literal(
            `(SELECT COUNT(*)::int FROM "Property" p WHERE p."marketId" = "Market"."id")`,
          ),
          'propertyCount',
        ],
      ],
    },
  })
  return markets.map((m) => {
    const json = m.toJSON() as any
    return {
      ...json,
      _count: { properties: Number(json.propertyCount ?? 0) },
    }
  })
}

export async function getRoleList() {
  return prisma.role.findMany({
    select: { id: true, name: true, description: true, permissions: true, isSystem: true },
    orderBy: { name: 'asc' },
  })
}
