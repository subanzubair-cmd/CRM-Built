import { prisma } from '@/lib/prisma'

/**
 * Picks a user to auto-assign a new lead to, based on the lead's LeadCampaign.
 *
 * Round-robin logic:
 * - Find UserCampaignAssignment rows where campaignId=X AND assignNewLeads=true
 * - Exclude users on vacation OR inactive
 * - Filter by UserRoleConfig.leadAccessEnabled=true for (userId, roleId)
 * - If 0 eligible users → null (lead stays unassigned)
 * - If 1 → that userId
 * - If >1 → pick the user with the fewest recent PropertyTeamAssignment rows
 *          on properties belonging to this campaign (last 30 days)
 */
export async function pickAssigneeForNewLead(
  leadCampaignId: string | null | undefined,
): Promise<string | null> {
  if (!leadCampaignId) return null
  const picks = await findEligibleAssignees(leadCampaignId)
  if (picks.length === 0) return null
  if (picks.length === 1) return picks[0]
  return pickLeastLoaded(picks, leadCampaignId)
}

/**
 * Picks a user for a specific role on a specific LeadCampaign. Used by the
 * team auto-populate flow to fill one PropertyTeamAssignment row per role.
 */
export async function pickAssigneeForRole(
  leadCampaignId: string,
  roleId: string,
): Promise<string | null> {
  const picks = await findEligibleAssignees(leadCampaignId, roleId)
  if (picks.length === 0) return null
  if (picks.length === 1) return picks[0]
  return pickLeastLoaded(picks, leadCampaignId, roleId)
}

async function findEligibleAssignees(
  leadCampaignId: string,
  roleId?: string,
): Promise<string[]> {
  const assignments = await prisma.userCampaignAssignment.findMany({
    where: {
      campaignId: leadCampaignId,
      ...(roleId ? { roleId } : {}),
      assignNewLeads: true,
      user: { vacationMode: false, status: 'ACTIVE' },
    },
    select: { userId: true, roleId: true },
  })
  if (assignments.length === 0) return []

  // Filter to users who also have UserRoleConfig.leadAccessEnabled for the same role
  const roleConfigs = await (prisma as any).userRoleConfig.findMany({
    where: {
      OR: assignments.map((a) => ({ userId: a.userId, roleId: a.roleId })),
      leadAccessEnabled: true,
    },
    select: { userId: true, roleId: true },
  }) as Array<{ userId: string; roleId: string }>
  const enabledSet = new Set(roleConfigs.map((r) => `${r.userId}:${r.roleId}`))

  const eligible = assignments
    .filter((a) => enabledSet.has(`${a.userId}:${a.roleId}`))
    .map((a) => a.userId)
  return Array.from(new Set(eligible))
}

async function pickLeastLoaded(
  userIds: string[],
  leadCampaignId: string,
  roleId?: string,
): Promise<string> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Count recent PropertyTeamAssignment rows (optionally scoped to roleId) on
  // properties in this campaign, grouped by user.
  const recent = await (prisma as any).propertyTeamAssignment.findMany({
    where: {
      userId: { in: userIds },
      ...(roleId ? { roleId } : {}),
      createdAt: { gte: since },
      property: { leadCampaignId },
    },
    select: { userId: true },
  }) as Array<{ userId: string }>

  const counts = new Map<string, number>()
  for (const uid of userIds) counts.set(uid, 0)
  for (const r of recent) counts.set(r.userId, (counts.get(r.userId) ?? 0) + 1)

  let minCount = Infinity
  let picked = userIds[0]
  for (const [uid, count] of counts.entries()) {
    if (count < minCount) {
      minCount = count
      picked = uid
    }
  }
  return picked
}
