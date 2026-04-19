import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const PairSchema = z.object({
  roleId: z.string().min(1),
  campaignId: z.string().min(1),
})

const BodySchema = z.object({
  removedPairs: z.array(PairSchema).min(1),
})

/**
 * POST /api/users/[id]/access-revocation-impact
 *
 * Given a set of (role, campaign) pairs being removed from user `id`,
 * return the leads / team slots / tasks that would be orphaned so the UI
 * can ask an admin to reassign them before the remove is committed.
 *
 * For each pair we return:
 *   - campaignId / roleId / campaignName / roleName (for display)
 *   - primaryLeadCount: # of properties on this campaign where assignedToId = user
 *   - teamSlotCount:    # of PropertyTeamAssignment rows for this (user, role, campaign)
 *   - openTaskCount:    # of pending tasks assigned to this user on this campaign
 *   - eligibleReplacements: users other than this one who hold the same
 *                           role+campaign AND have leadAccessEnabled, i.e. who
 *                           CAN take the work over.
 *
 * If all three counts are zero for every pair, the caller can proceed without
 * showing a confirmation modal.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'users.manage')
  if (deny) return deny

  const { id: userId } = await params
  const body = await req.json()
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { removedPairs } = parsed.data
  const campaignIds = Array.from(new Set(removedPairs.map((p) => p.campaignId)))
  const roleIds = Array.from(new Set(removedPairs.map((p) => p.roleId)))

  // 1. Load campaigns + roles for names (parallel)
  const [campaigns, roles, userRecord] = await Promise.all([
    prisma.leadCampaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, name: true },
    }),
    prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    }),
  ])

  if (!userRecord) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]))
  const roleNameById = new Map(roles.map((r) => [r.id, r.name]))

  // 2. For each pair, compute counts in parallel
  const buckets = await Promise.all(
    removedPairs.map(async (pair) => {
      const [primaryLeadCount, teamSlotCount, openTaskCount, eligibleReplacements] =
        await Promise.all([
          prisma.property.count({
            where: { leadCampaignId: pair.campaignId, assignedToId: userId },
          }),
          (prisma as any).propertyTeamAssignment.count({
            where: {
              userId,
              roleId: pair.roleId,
              property: { leadCampaignId: pair.campaignId },
            },
          }) as Promise<number>,
          prisma.task.count({
            where: {
              assignedToId: userId,
              status: 'PENDING',
              property: { leadCampaignId: pair.campaignId },
            },
          }),
          // Replacement candidates: other users with UserCampaignAssignment for
          // this (role, campaign) AND UserRoleConfig.leadAccessEnabled. These
          // are the people who could legitimately take the work over.
          (async () => {
            const otherAssignments = await prisma.userCampaignAssignment.findMany({
              where: {
                roleId: pair.roleId,
                campaignId: pair.campaignId,
                userId: { not: userId },
                user: { status: 'ACTIVE', vacationMode: false },
              },
              select: {
                userId: true,
                user: { select: { id: true, name: true, email: true } },
              },
            })
            if (otherAssignments.length === 0) return []
            const otherIds = otherAssignments.map((a) => a.userId)
            const enabled = await (prisma as any).userRoleConfig.findMany({
              where: {
                userId: { in: otherIds },
                roleId: pair.roleId,
                leadAccessEnabled: true,
              },
              select: { userId: true },
            }) as Array<{ userId: string }>
            const enabledSet = new Set(enabled.map((e) => e.userId))
            return otherAssignments
              .filter((a) => enabledSet.has(a.userId))
              .map((a) => a.user)
              .filter((u): u is { id: string; name: string; email: string } => Boolean(u))
          })(),
        ])

      return {
        roleId: pair.roleId,
        roleName: roleNameById.get(pair.roleId) ?? 'Role',
        campaignId: pair.campaignId,
        campaignName: campaignNameById.get(pair.campaignId) ?? 'Campaign',
        primaryLeadCount,
        teamSlotCount,
        openTaskCount,
        totalAffected: primaryLeadCount + teamSlotCount + openTaskCount,
        eligibleReplacements,
      }
    }),
  )

  const hasAnyImpact = buckets.some((b) => b.totalAffected > 0)

  return NextResponse.json({
    userId: userRecord.id,
    userName: userRecord.name,
    hasAnyImpact,
    buckets,
  })
}
