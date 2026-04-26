import {
  UserCampaignAssignment,
  UserRoleConfig,
  PropertyTeamAssignment,
  User,
  Op,
  literal,
  sequelize,
} from '@crm/database'

export async function pickAssigneeForNewLead(
  leadCampaignId: string | null | undefined,
): Promise<string | null> {
  if (!leadCampaignId) return null
  const picks = await findEligibleAssignees(leadCampaignId)
  if (picks.length === 0) return null
  if (picks.length === 1) return picks[0]
  return pickLeastLoaded(picks, leadCampaignId)
}

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
  const assignments = await UserCampaignAssignment.findAll({
    where: {
      campaignId: leadCampaignId,
      ...(roleId ? { roleId } : {}),
      assignNewLeads: true,
    },
    include: [
      {
        model: User,
        as: 'user',
        where: { vacationMode: false, status: 'ACTIVE' },
        required: true,
        attributes: [],
      },
    ],
    attributes: ['userId', 'roleId'],
    raw: true,
  }) as unknown as Array<{ userId: string; roleId: string }>
  if (assignments.length === 0) return []

  const roleConfigs = await UserRoleConfig.findAll({
    where: {
      [Op.or]: assignments.map((a) => ({ userId: a.userId, roleId: a.roleId })),
      leadAccessEnabled: true,
    },
    attributes: ['userId', 'roleId'],
    raw: true,
  }) as unknown as Array<{ userId: string; roleId: string }>
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

  const recent = await PropertyTeamAssignment.findAll({
    where: {
      userId: { [Op.in]: userIds },
      ...(roleId ? { roleId } : {}),
      createdAt: { [Op.gte]: since },
      propertyId: {
        [Op.in]: literal(`(SELECT id FROM "Property" WHERE "leadCampaignId" = ${sequelize.escape(leadCampaignId)})`),
      },
    },
    attributes: ['userId'],
    raw: true,
  }) as unknown as Array<{ userId: string }>

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
