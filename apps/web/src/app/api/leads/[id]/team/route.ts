import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { emitEvent, DomainEvents } from '@/lib/domain-events'

type Params = { params: Promise<{ id: string }> }

const AssignmentsSchema = z.object({
  assignments: z.array(
    z.object({
      roleId: z.string().min(1),
      userId: z.string().min(1).nullable(),
    }),
  ),
})

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.view')
  if (deny) return deny

  try {
    const { id } = await params

    // 1. Pull the property (with embedded campaign + roleToggles + userAssignments)
    //    AND the current PropertyTeamAssignment rows in parallel. One round-trip
    //    replaces the previous three sequential fetches.
    const [property, currentAssignments] = await Promise.all([
      prisma.property.findUnique({
        where: { id },
        select: {
          id: true,
          leadCampaignId: true,
          leadCampaign: {
            select: {
              id: true,
              roleToggles: {
                where: { enabled: true },
                select: { roleId: true, role: { select: { id: true, name: true } } },
              },
              userAssignments: {
                select: { userId: true, roleId: true },
              },
            },
          },
        },
      }),
      (prisma as any).propertyTeamAssignment.findMany({
        where: { propertyId: id },
        select: { roleId: true, userId: true },
      }) as Promise<Array<{ roleId: string; userId: string }>>,
    ])

    if (!property) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (!property.leadCampaignId || !property.leadCampaign) {
      return NextResponse.json({ data: { rows: [] } })
    }

    const campaign = property.leadCampaign
    const assignedByRole = new Map<string, string>()
    for (const a of currentAssignments) assignedByRole.set(a.roleId, a.userId)

    // 2. One query for UserRoleConfig.leadAccessEnabled across every (user, role)
    //    pair from this campaign's assignments.
    const candidatePairs = campaign.userAssignments
    const eligibleSet = new Set<string>()
    if (candidatePairs.length > 0) {
      const roleConfigs = await (prisma as any).userRoleConfig.findMany({
        where: {
          OR: candidatePairs.map((p) => ({ userId: p.userId, roleId: p.roleId })),
          leadAccessEnabled: true,
        },
        select: { userId: true, roleId: true },
      }) as Array<{ userId: string; roleId: string }>
      for (const c of roleConfigs) eligibleSet.add(`${c.userId}:${c.roleId}`)
    }

    // 3. Collect all eligible userIds across all roles, one User query.
    const eligibleUserIdsByRole = new Map<string, string[]>()
    for (const a of candidatePairs) {
      if (!eligibleSet.has(`${a.userId}:${a.roleId}`)) continue
      const list = eligibleUserIdsByRole.get(a.roleId) ?? []
      list.push(a.userId)
      eligibleUserIdsByRole.set(a.roleId, list)
    }
    const allEligibleUserIds = Array.from(
      new Set(Array.from(eligibleUserIdsByRole.values()).flat()),
    )
    const users = allEligibleUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: allEligibleUserIds }, status: 'ACTIVE' },
          select: { id: true, name: true, email: true },
          orderBy: { name: 'asc' },
        })
      : []
    const userById = new Map(users.map((u) => [u.id, u]))

    // 4. Build rows in memory. A role row is shown only if at least one
    //    eligible user exists (UserCampaignAssignment ∩ UserRoleConfig.leadAccessEnabled)
    //    OR someone is already assigned to this lead for that role (even if
    //    that user has since lost eligibility — show the stale assignment so
    //    admin can see and clear it).
    //
    //    Rationale: we don't want "Unassigned" rows for roles that have no
    //    configured users — those would inflate unassigned-lead metrics in
    //    analytics. True "Unassigned" should mean eligible users exist but
    //    none has been picked for this lead yet.
    const rows = campaign.roleToggles
      .map((toggle) => {
        const roleId = toggle.roleId
        const ids = eligibleUserIdsByRole.get(roleId) ?? []
        const rowUsers = ids
          .map((uid) => userById.get(uid))
          .filter((u): u is { id: string; name: string; email: string } => Boolean(u))
          .sort((a, b) => a.name.localeCompare(b.name))
        return {
          roleId,
          roleName: toggle.role.name,
          users: rowUsers,
          assignedUserId: assignedByRole.get(roleId) ?? null,
        }
      })
      .filter((row) => row.users.length > 0 || row.assignedUserId !== null)

    return NextResponse.json({
      data: {
        leadCampaignId: campaign.id,
        rows,
      },
    })
  } catch (err) {
    console.error('[leads/team GET] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny

  try {
    const { id } = await params
    const body = await req.json()
    const parsed = AssignmentsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const { assignments } = parsed.data
    const sessionUser = (session as any)?.user ?? {}
    const actorUserId = sessionUser.id as string

    // Snapshot the current state so we can diff for audit events
    const before = await (prisma as any).propertyTeamAssignment.findMany({
      where: { propertyId: id },
      select: {
        roleId: true,
        userId: true,
        role: { select: { name: true } },
      },
    }) as Array<{ roleId: string; userId: string; role: { name: string } }>
    const beforeByRole = new Map(before.map((b) => [b.roleId, b]))

    // Resolve role names for any incoming roles not currently assigned
    const missingRoleIds = assignments
      .filter((a) => !beforeByRole.has(a.roleId))
      .map((a) => a.roleId)
    const addedRoles = missingRoleIds.length
      ? await prisma.role.findMany({
          where: { id: { in: missingRoleIds } },
          select: { id: true, name: true },
        })
      : []
    const roleNameById = new Map<string, string>(addedRoles.map((r) => [r.id, r.name]))
    for (const b of before) roleNameById.set(b.roleId, b.role.name)

    await prisma.$transaction(async (tx) => {
      for (const a of assignments) {
        if (a.userId === null) {
          await (tx as any).propertyTeamAssignment.deleteMany({
            where: { propertyId: id, roleId: a.roleId },
          })
        } else {
          await (tx as any).propertyTeamAssignment.upsert({
            where: { propertyId_roleId: { propertyId: id, roleId: a.roleId } },
            create: { propertyId: id, roleId: a.roleId, userId: a.userId },
            update: { userId: a.userId },
          })
        }
      }
    })

    // Emit audit events per diff (fire-and-forget)
    for (const a of assignments) {
      const prior = beforeByRole.get(a.roleId)
      const roleName = roleNameById.get(a.roleId) ?? 'Unknown'
      if (a.userId === null) {
        if (prior) {
          void emitEvent({
            type: DomainEvents.TEAM_MEMBER_REMOVED,
            propertyId: id,
            userId: actorUserId,
            actorType: 'user',
            payload: { roleId: a.roleId, roleName, removedUserId: prior.userId },
          })
        }
      } else if (!prior || prior.userId !== a.userId) {
        void emitEvent({
          type: DomainEvents.TEAM_MEMBER_ASSIGNED,
          propertyId: id,
          userId: actorUserId,
          actorType: 'user',
          payload: {
            roleId: a.roleId,
            roleName,
            assignedUserId: a.userId,
            ...(prior ? { replacedUserId: prior.userId } : {}),
          },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[leads/team POST] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
