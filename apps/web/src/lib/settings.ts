import { prisma } from '@/lib/prisma'

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
  return prisma.market.findMany({
    include: { _count: { select: { properties: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function getRoleList() {
  return prisma.role.findMany({
    select: { id: true, name: true, description: true, permissions: true, isSystem: true },
    orderBy: { name: 'asc' },
  })
}
