import { prisma } from '@/lib/prisma'
import { emitEvent, DomainEvents } from '@/lib/domain-events'

/**
 * Shared in-memory structures used by both single-property and campaign-wide
 * auto-populate. Computed once per campaign snapshot.
 */
interface CampaignEligibility {
  enabledRoleToggles: Array<{ roleId: string; roleName: string }>
  eligibleByRole: Map<string, string[]> // roleId → candidate userIds
  loadByUserRole: Map<string, number>   // `userId:roleId` → recent assignment count
}

/**
 * Load campaign config + eligibility in the minimum number of queries.
 * This is the hot path — both single-property autoPopulateTeam and the
 * campaign-wide batch version share this. Three queries total.
 */
async function loadCampaignEligibility(leadCampaignId: string): Promise<CampaignEligibility | null> {
  const campaign = await prisma.leadCampaign.findUnique({
    where: { id: leadCampaignId },
    select: {
      roleToggles: {
        where: { enabled: true },
        select: { roleId: true, role: { select: { name: true } } },
      },
      userAssignments: {
        where: {
          assignNewLeads: true,
          user: { vacationMode: false, status: 'ACTIVE' },
        },
        select: { userId: true, roleId: true },
      },
    },
  })
  if (!campaign || campaign.roleToggles.length === 0) return null

  const enabledRoleIds = new Set(campaign.roleToggles.map((t) => t.roleId))
  const enabledRoleToggles = campaign.roleToggles.map((t) => ({
    roleId: t.roleId,
    roleName: t.role.name,
  }))

  const candidatePairs = campaign.userAssignments.filter((a) => enabledRoleIds.has(a.roleId))
  if (candidatePairs.length === 0) {
    return { enabledRoleToggles, eligibleByRole: new Map(), loadByUserRole: new Map() }
  }

  // Intersect with UserRoleConfig.leadAccessEnabled in a single query.
  const roleConfigs = await (prisma as any).userRoleConfig.findMany({
    where: {
      OR: candidatePairs.map((p) => ({ userId: p.userId, roleId: p.roleId })),
      leadAccessEnabled: true,
    },
    select: { userId: true, roleId: true },
  }) as Array<{ userId: string; roleId: string }>
  const enabledSet = new Set(roleConfigs.map((r) => `${r.userId}:${r.roleId}`))

  const eligibleByRole = new Map<string, string[]>()
  for (const a of candidatePairs) {
    if (!enabledSet.has(`${a.userId}:${a.roleId}`)) continue
    const list = eligibleByRole.get(a.roleId) ?? []
    list.push(a.userId)
    eligibleByRole.set(a.roleId, list)
  }

  // Least-loaded round-robin: load recent assignment counts for all candidate users in one query.
  const allCandidateUserIds = Array.from(new Set(Array.from(eligibleByRole.values()).flat()))
  const loadByUserRole = new Map<string, number>()
  if (allCandidateUserIds.length > 0) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const recent = await (prisma as any).propertyTeamAssignment.findMany({
      where: {
        userId: { in: allCandidateUserIds },
        createdAt: { gte: since },
        property: { leadCampaignId },
      },
      select: { userId: true, roleId: true },
    }) as Array<{ userId: string; roleId: string }>
    for (const r of recent) {
      const k = `${r.userId}:${r.roleId}`
      loadByUserRole.set(k, (loadByUserRole.get(k) ?? 0) + 1)
    }
  }

  return { enabledRoleToggles, eligibleByRole, loadByUserRole }
}

/** Pick the least-loaded candidate for a role, then bump the in-memory load. */
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

/**
 * Auto-populate PropertyTeamAssignment rows for every enabled role on the
 * property's LeadCampaign where at least one eligible user exists.
 *
 * Fast path: one createMany for all fills, 4 total queries regardless of
 * how many roles are enabled.
 *
 * Preserves existing assignments (idempotent — safe to re-run).
 * Fire-and-forget safe: swallows errors to avoid blocking the caller.
 */
export async function autoPopulateTeam(
  propertyId: string,
  leadCampaignId: string,
  actorUserId: string,
): Promise<void> {
  try {
    const [eligibility, existing] = await Promise.all([
      loadCampaignEligibility(leadCampaignId),
      (prisma as any).propertyTeamAssignment.findMany({
        where: { propertyId },
        select: { roleId: true },
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

    await (prisma as any).propertyTeamAssignment.createMany({
      data: rowsToCreate,
      skipDuplicates: true,
    })

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

/**
 * Campaign-wide batch version. Loads campaign config + eligibility ONCE
 * and fans out across all properties in a single bulk insert. Fixed query
 * cost regardless of property count — designed for the backfill path
 * triggered by role-configs save.
 */
export async function autoPopulateTeamForCampaign(
  leadCampaignId: string,
  actorUserId: string,
): Promise<{ propertiesScanned: number; slotsFilled: number }> {
  try {
    const eligibility = await loadCampaignEligibility(leadCampaignId)
    if (!eligibility || eligibility.enabledRoleToggles.length === 0) {
      return { propertiesScanned: 0, slotsFilled: 0 }
    }

    // One query pulls every property + its existing team assignments on this campaign.
    const properties = await prisma.property.findMany({
      where: { leadCampaignId },
      select: {
        id: true,
        teamAssignments: { select: { roleId: true } },
      },
    })

    const rowsToCreate: Array<{ propertyId: string; roleId: string; userId: string }> = []
    const events: Array<{ propertyId: string; roleId: string; roleName: string; userId: string }> = []

    for (const p of properties) {
      const assignedRoleIds = new Set(p.teamAssignments.map((t) => t.roleId))
      for (const toggle of eligibility.enabledRoleToggles) {
        if (assignedRoleIds.has(toggle.roleId)) continue
        const picked = pickLeastLoadedInMemory(eligibility, toggle.roleId)
        if (!picked) continue
        rowsToCreate.push({ propertyId: p.id, roleId: toggle.roleId, userId: picked })
        events.push({
          propertyId: p.id,
          roleId: toggle.roleId,
          roleName: toggle.roleName,
          userId: picked,
        })
      }
    }

    if (rowsToCreate.length === 0) {
      return { propertiesScanned: properties.length, slotsFilled: 0 }
    }

    await (prisma as any).propertyTeamAssignment.createMany({
      data: rowsToCreate,
      skipDuplicates: true,
    })

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

/**
 * Re-evaluate team when a property's leadCampaignId changes. Drops
 * assignments that are no longer valid under the new campaign (role disabled
 * OR user no longer on new campaign), then fills any vacancies via
 * autoPopulateTeam.
 *
 * Fire-and-forget safe.
 */
export async function reEvaluateTeam(
  propertyId: string,
  oldCampaignId: string | null | undefined,
  newCampaignId: string | null | undefined,
  actorUserId: string,
): Promise<void> {
  try {
    if (oldCampaignId === newCampaignId) return

    const existing = await (prisma as any).propertyTeamAssignment.findMany({
      where: { propertyId },
      select: { id: true, roleId: true, userId: true, role: { select: { name: true } } },
    }) as Array<{ id: string; roleId: string; userId: string; role: { name: string } }>

    // If the campaign was cleared, remove everything auto-derived.
    if (!newCampaignId) {
      if (existing.length === 0) return
      await (prisma as any).propertyTeamAssignment.deleteMany({ where: { propertyId } })
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

    // Single fetch for the new campaign's enabled roles + user assignments.
    const newCampaign = await prisma.leadCampaign.findUnique({
      where: { id: newCampaignId },
      select: {
        roleToggles: {
          where: { enabled: true },
          select: { roleId: true },
        },
        userAssignments: {
          select: { userId: true, roleId: true },
        },
      },
    })
    if (!newCampaign) return

    const enabledRoleIds = new Set(newCampaign.roleToggles.map((t) => t.roleId))
    const newUserRoleSet = new Set(
      newCampaign.userAssignments.map((u) => `${u.userId}:${u.roleId}`),
    )

    const rowsToDrop = existing.filter((row) => {
      if (!enabledRoleIds.has(row.roleId)) return true
      if (!newUserRoleSet.has(`${row.userId}:${row.roleId}`)) return true
      return false
    })

    if (rowsToDrop.length > 0) {
      await (prisma as any).propertyTeamAssignment.deleteMany({
        where: { id: { in: rowsToDrop.map((r) => r.id) } },
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
