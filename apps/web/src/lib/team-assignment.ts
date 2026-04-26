import {
  LeadCampaign,
  LeadCampaignRoleToggle,
  UserCampaignAssignment,
  UserRoleConfig,
  PropertyTeamAssignment,
  Property,
  Role,
  User,
  Op,
  literal,
  sequelize,
} from '@crm/database'
import { emitEvent, DomainEvents } from '@/lib/domain-events'

/**
 * Shared in-memory structures used by both single-property and campaign-wide
 * auto-populate. Computed once per campaign snapshot.
 */
interface CampaignEligibility {
  enabledRoleToggles: Array<{ roleId: string; roleName: string }>
  eligibleByRole: Map<string, string[]>
  loadByUserRole: Map<string, number>
}

async function loadCampaignEligibility(leadCampaignId: string): Promise<CampaignEligibility | null> {
  const toggleRows = await LeadCampaignRoleToggle.findAll({
    where: { leadCampaignId, enabled: true },
    include: [{ model: Role, as: 'role', attributes: ['name'] }],
    raw: true,
    nest: true,
  })
  if (toggleRows.length === 0) return null

  const enabledRoleIds = new Set(toggleRows.map((t: any) => t.roleId))
  const enabledRoleToggles = toggleRows.map((t: any) => ({
    roleId: t.roleId as string,
    roleName: (t.role?.name ?? '') as string,
  }))

  const candidatePairs = await UserCampaignAssignment.findAll({
    where: { campaignId: leadCampaignId, assignNewLeads: true },
    include: [
      {
        model: User,
        as: 'user',
        where: { vacationMode: false, status: 'ACTIVE' },
        attributes: [],
        required: true,
      },
    ],
    attributes: ['userId', 'roleId'],
    raw: true,
  }) as unknown as Array<{ userId: string; roleId: string }>

  const filteredPairs = candidatePairs.filter((p) => enabledRoleIds.has(p.roleId))
  if (filteredPairs.length === 0) {
    return { enabledRoleToggles, eligibleByRole: new Map(), loadByUserRole: new Map() }
  }

  const roleConfigs = await UserRoleConfig.findAll({
    where: {
      [Op.or]: filteredPairs.map((p) => ({ userId: p.userId, roleId: p.roleId })),
      leadAccessEnabled: true,
    },
    attributes: ['userId', 'roleId'],
    raw: true,
  }) as unknown as Array<{ userId: string; roleId: string }>
  const enabledSet = new Set(roleConfigs.map((r) => `${r.userId}:${r.roleId}`))

  const eligibleByRole = new Map<string, string[]>()
  for (const a of filteredPairs) {
    if (!enabledSet.has(`${a.userId}:${a.roleId}`)) continue
    const list = eligibleByRole.get(a.roleId) ?? []
    list.push(a.userId)
    eligibleByRole.set(a.roleId, list)
  }

  const allCandidateUserIds = Array.from(new Set(Array.from(eligibleByRole.values()).flat()))
  const loadByUserRole = new Map<string, number>()
  if (allCandidateUserIds.length > 0) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const recent = await PropertyTeamAssignment.findAll({
      where: {
        userId: { [Op.in]: allCandidateUserIds },
        createdAt: { [Op.gte]: since },
        propertyId: {
          [Op.in]: literal(`(SELECT id FROM "Property" WHERE "leadCampaignId" = ${sequelize.escape(leadCampaignId)})`),
        },
      },
      attributes: ['userId', 'roleId'],
      raw: true,
    }) as unknown as Array<{ userId: string; roleId: string }>
    for (const r of recent) {
      const k = `${r.userId}:${r.roleId}`
      loadByUserRole.set(k, (loadByUserRole.get(k) ?? 0) + 1)
    }
  }

  return { enabledRoleToggles, eligibleByRole, loadByUserRole }
}

function pickLeastLoadedInMemory(
  eligibility: CampaignEligibility,
  roleId: string,
): string | null {
  const cands = eligibility.eligibleByRole.get(roleId)
  if (!cands || cands.length === 0) return null
  let picked = cands[0]
  let minLoad = eligibility.loadByUserRole.get(`${picked}:${roleId}`) ?? 0
  for (let i = 1; i < cands.length; i++) {
    const c = cands[i]
    const load = eligibility.loadByUserRole.get(`${c}:${roleId}`) ?? 0
    if (load < minLoad) { minLoad = load; picked = c }
  }
  eligibility.loadByUserRole.set(`${picked}:${roleId}`, minLoad + 1)
  return picked
}

export async function autoPopulateTeam(
  propertyId: string,
  leadCampaignId: string,
  actorUserId: string,
): Promise<void> {
  try {
    const [eligibility, existing] = await Promise.all([
      loadCampaignEligibility(leadCampaignId),
      PropertyTeamAssignment.findAll({
        where: { propertyId },
        attributes: ['roleId'],
        raw: true,
      }) as Promise<Array<{ roleId: string }>>,
    ])
    if (!eligibility) return
    const assignedRoleIds = new Set(existing.map((e) => e.roleId))
    const missing = eligibility.enabledRoleToggles.filter((t) => !assignedRoleIds.has(t.roleId))
    if (missing.length === 0) return

    const rowsToCreate: Array<{ propertyId: string; roleId: string; userId: string }> = []
    const events: Array<{ roleId: string; roleName: string; userId: string }> = []
    for (const toggle of missing) {
      const picked = pickLeastLoadedInMemory(eligibility, toggle.roleId)
      if (!picked) continue
      rowsToCreate.push({ propertyId, roleId: toggle.roleId, userId: picked })
      events.push({ roleId: toggle.roleId, roleName: toggle.roleName, userId: picked })
    }
    if (rowsToCreate.length === 0) return

    await PropertyTeamAssignment.bulkCreate(rowsToCreate, { ignoreDuplicates: true })

    for (const e of events) {
      void emitEvent({
        type: DomainEvents.TEAM_AUTO_POPULATED,
        propertyId,
        userId: actorUserId,
        actorType: 'system',
        payload: { roleId: e.roleId, roleName: e.roleName, assignedUserId: e.userId },
      })
    }
  } catch (err) {
    console.error('[team-assignment] autoPopulateTeam failed:', err)
  }
}

export async function autoPopulateTeamForCampaign(
  leadCampaignId: string,
  actorUserId: string,
): Promise<{ propertiesScanned: number; slotsFilled: number }> {
  try {
    const eligibility = await loadCampaignEligibility(leadCampaignId)
    if (!eligibility || eligibility.enabledRoleToggles.length === 0) {
      return { propertiesScanned: 0, slotsFilled: 0 }
    }

    const properties = await Property.findAll({
      where: { leadCampaignId },
      attributes: ['id'],
      include: [
        {
          model: PropertyTeamAssignment,
          as: 'teamAssignments',
          attributes: ['roleId'],
          required: false,
        },
      ],
    })

    const rowsToCreate: Array<{ propertyId: string; roleId: string; userId: string }> = []
    const events: Array<{ propertyId: string; roleId: string; roleName: string; userId: string }> = []

    for (const p of properties) {
      const plain = p.get({ plain: true }) as any
      const assignedRoleIds = new Set((plain.teamAssignments ?? []).map((t: any) => t.roleId))
      for (const toggle of eligibility.enabledRoleToggles) {
        if (assignedRoleIds.has(toggle.roleId)) continue
        const picked = pickLeastLoadedInMemory(eligibility, toggle.roleId)
        if (!picked) continue
        rowsToCreate.push({ propertyId: plain.id as string, roleId: toggle.roleId, userId: picked })
        events.push({
          propertyId: plain.id as string,
          roleId: toggle.roleId,
          roleName: toggle.roleName,
          userId: picked,
        })
      }
    }

    if (rowsToCreate.length === 0) {
      return { propertiesScanned: properties.length, slotsFilled: 0 }
    }

    await PropertyTeamAssignment.bulkCreate(rowsToCreate, { ignoreDuplicates: true })

    for (const evt of events) {
      void emitEvent({
        type: DomainEvents.TEAM_AUTO_POPULATED,
        propertyId: evt.propertyId,
        userId: actorUserId,
        actorType: 'system',
        payload: { roleId: evt.roleId, roleName: evt.roleName, assignedUserId: evt.userId },
      })
    }

    return { propertiesScanned: properties.length, slotsFilled: rowsToCreate.length }
  } catch (err) {
    console.error('[team-assignment] autoPopulateTeamForCampaign failed:', err)
    return { propertiesScanned: 0, slotsFilled: 0 }
  }
}

export async function reEvaluateTeam(
  propertyId: string,
  oldCampaignId: string | null | undefined,
  newCampaignId: string | null | undefined,
  actorUserId: string,
): Promise<void> {
  try {
    if (oldCampaignId === newCampaignId) return

    const existing = await PropertyTeamAssignment.findAll({
      where: { propertyId },
      include: [{ model: Role, as: 'role', attributes: ['name'] }],
      raw: true,
      nest: true,
    }) as unknown as Array<{ id: string; roleId: string; userId: string; role: { name: string } }>

    if (!newCampaignId) {
      if (existing.length === 0) return
      await PropertyTeamAssignment.destroy({ where: { propertyId } })
      for (const row of existing) {
        void emitEvent({
          type: DomainEvents.TEAM_MEMBER_REMOVED,
          propertyId,
          userId: actorUserId,
          actorType: 'system',
          payload: {
            roleId: row.roleId,
            roleName: row.role.name,
            removedUserId: row.userId,
            reason: 'campaign_cleared',
          },
        })
      }
      return
    }

    const newCampaign = await LeadCampaign.findByPk(newCampaignId, {
      include: [
        {
          model: LeadCampaignRoleToggle,
          as: 'roleToggles',
          where: { enabled: true },
          required: false,
          attributes: ['roleId'],
        },
        {
          model: UserCampaignAssignment,
          as: 'userAssignments',
          attributes: ['userId', 'roleId'],
          required: false,
        },
      ],
    })
    if (!newCampaign) return

    const plain = newCampaign.get({ plain: true }) as any
    const enabledRoleIds = new Set((plain.roleToggles ?? []).map((t: any) => t.roleId))
    const newUserRoleSet = new Set(
      (plain.userAssignments ?? []).map((u: any) => `${u.userId}:${u.roleId}`),
    )

    const rowsToDrop = existing.filter((row) => {
      if (!enabledRoleIds.has(row.roleId)) return true
      if (!newUserRoleSet.has(`${row.userId}:${row.roleId}`)) return true
      return false
    })

    if (rowsToDrop.length > 0) {
      await PropertyTeamAssignment.destroy({
        where: { id: { [Op.in]: rowsToDrop.map((r) => r.id) } },
      })
      for (const row of rowsToDrop) {
        void emitEvent({
          type: DomainEvents.TEAM_MEMBER_REMOVED,
          propertyId,
          userId: actorUserId,
          actorType: 'system',
          payload: {
            roleId: row.roleId,
            roleName: row.role.name,
            removedUserId: row.userId,
            reason: 'campaign_changed',
          },
        })
      }
    }

    await autoPopulateTeam(propertyId, newCampaignId, actorUserId)
  } catch (err) {
    console.error('[team-assignment] reEvaluateTeam failed:', err)
  }
}
