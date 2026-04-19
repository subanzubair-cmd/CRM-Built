import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'
import { emitEvent, DomainEvents } from '@/lib/domain-events'
import { autoPopulateTeamForCampaign } from '@/lib/team-assignment'
import { pickAssigneeForNewLead } from '@/lib/lead-assignment'

type Params = { params: Promise<{ id: string }> }

const CampaignConfigSchema = z.object({
  campaignId: z.string().min(1),
  assignNewLeads: z.boolean().default(false),
  backfillExistingLeads: z.boolean().default(false),
})

const RoleConfigSchema = z.object({
  roleId: z.string().min(1),
  leadAccessEnabled: z.boolean().default(false),
  campaigns: z.array(CampaignConfigSchema).default([]),
})

/**
 * When roles/campaigns are being REMOVED from a user, the caller can supply
 * per-pair reassignments so the affected leads/team-slots/tasks get picked up
 * by another team member rather than being orphaned.
 *
 * `reassignToUserId: null` means "leave the items unassigned after removing this user".
 */
const ReassignmentSchema = z.object({
  roleId: z.string().min(1),
  campaignId: z.string().min(1),
  reassignToUserId: z.string().nullable(),
})

const UpsertBodySchema = z.object({
  configs: z.array(RoleConfigSchema),
  reassignments: z.array(ReassignmentSchema).optional(),
})

/**
 * GET /api/users/:id/role-configs
 * Returns the full role config tree for the user: per-role lead access plus
 * per-role campaign assignments resolved against LeadCampaign.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'users.view')
  if (deny) return deny

  const { id: userId } = await params

  // Parallel fetch + UserCampaignAssignment embeds the LeadCampaign via the
  // newly-aligned FK — drops the extra leadCampaign.findMany round-trip.
  const [roleConfigs, assignments] = await Promise.all([
    (prisma as any).userRoleConfig.findMany({
      where: { userId },
      include: { role: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.userCampaignAssignment.findMany({
      where: { userId },
      select: {
        campaignId: true,
        roleId: true,
        assignNewLeads: true,
        backfillExistingLeads: true,
        campaign: { select: { id: true, name: true, type: true } },
      },
    }),
  ]) as [
    Array<{ roleId: string; role: { id: string; name: string }; leadAccessEnabled: boolean }>,
    Array<{
      campaignId: string
      roleId: string
      assignNewLeads: boolean
      backfillExistingLeads: boolean
      campaign: { id: string; name: string; type: string } | null
    }>,
  ]

  const data = roleConfigs.map((rc) => {
    const campaignsForRole = assignments
      .filter((a) => a.roleId === rc.roleId)
      .flatMap((a) => {
        if (!a.campaign) return [] // dangling FK — skip
        return [{
          campaignId: a.campaignId,
          campaign: a.campaign,
          assignNewLeads: a.assignNewLeads,
          backfillExistingLeads: a.backfillExistingLeads,
        }]
      })

    return {
      roleId: rc.roleId,
      role: rc.role,
      leadAccessEnabled: rc.leadAccessEnabled,
      campaigns: campaignsForRole,
    }
  })

  return NextResponse.json({ data })
}

/**
 * POST /api/users/:id/role-configs
 * Replaces the user's role config tree transactionally. Upserts UserRoleConfig
 * rows, prunes any not in the new set, and syncs UserCampaignAssignment rows
 * per (userId, roleId).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'users.manage')
  if (deny) return deny

  const { id: userId } = await params

  const body = await req.json()
  const parsed = UpsertBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { configs, reassignments = [] } = parsed.data
  const keepRoleIds = configs.map((c) => c.roleId)

  // Build a lookup of reassignment choices keyed by `${roleId}:${campaignId}`.
  // When a pair is being removed AND a reassignment target is specified, we
  // move the user's primary-assignees / team slots / tasks on that pair
  // over to the target BEFORE the cascade deletes drop them.
  const reassignMap = new Map<string, string | null>()
  for (const r of reassignments) {
    reassignMap.set(`${r.roleId}:${r.campaignId}`, r.reassignToUserId)
  }

  // Snapshot current UserCampaignAssignment rows so we can diff + clean up any
  // PropertyTeamAssignment rows whose (user, role, campaign) context is being removed.
  const beforeAssignments = await prisma.userCampaignAssignment.findMany({
    where: { userId },
    select: { roleId: true, campaignId: true },
  })

  // Build the set of (roleId, campaignId) pairs that will REMAIN after this write
  const keepPairs = new Set<string>()
  for (const cfg of configs) {
    for (const cmp of cfg.campaigns) {
      keepPairs.add(`${cfg.roleId}:${cmp.campaignId}`)
    }
  }
  const removedPairs = beforeAssignments.filter(
    (a) => !keepPairs.has(`${a.roleId}:${a.campaignId}`),
  )

  // Collect campaigns that need a retroactive team backfill on existing leads.
  // The trigger is the EXISTING LEADS = Yes answer in the UI — stored as
  // UserCampaignAssignment.backfillExistingLeads. Every admin save that flips
  // this flag to true (or re-affirms it) fires the backfill, regardless of
  // whether the (role, campaign) pair already existed — admins should be able
  // to re-sync existing leads at any time.
  const backfillCampaignIds = new Set<string>()
  for (const cfg of configs) {
    for (const cmp of cfg.campaigns) {
      if (cmp.backfillExistingLeads) backfillCampaignIds.add(cmp.campaignId)
    }
  }

  try {
    const cleanupEvents: Array<{ propertyId: string; roleId: string; campaignId: string }> = []

    await prisma.$transaction(async (tx) => {
    // 1. Upsert UserRoleConfig for each submitted role
    for (const cfg of configs) {
      await (tx as any).userRoleConfig.upsert({
        where: { userId_roleId: { userId, roleId: cfg.roleId } },
        create: {
          userId,
          roleId: cfg.roleId,
          leadAccessEnabled: cfg.leadAccessEnabled,
        },
        update: {
          leadAccessEnabled: cfg.leadAccessEnabled,
        },
      })
    }

    // 2. Delete UserRoleConfig rows no longer in the submitted list
    await (tx as any).userRoleConfig.deleteMany({
      where: {
        userId,
        ...(keepRoleIds.length > 0 ? { roleId: { notIn: keepRoleIds } } : {}),
      },
    })

    // 3. Clean up campaign assignments for pruned roles (cascade doesn't
    //    handle these — they reference roleId directly)
    if (keepRoleIds.length > 0) {
      await tx.userCampaignAssignment.deleteMany({
        where: { userId, roleId: { notIn: keepRoleIds } },
      })
    } else {
      await tx.userCampaignAssignment.deleteMany({ where: { userId } })
    }

    // 4. For each role, sync its campaign assignments
    for (const cfg of configs) {
      const keepCampaignIds = cfg.campaigns.map((c) => c.campaignId)

      // Drop assignments for this role not in the new campaigns list
      await tx.userCampaignAssignment.deleteMany({
        where: {
          userId,
          roleId: cfg.roleId,
          ...(keepCampaignIds.length > 0
            ? { campaignId: { notIn: keepCampaignIds } }
            : {}),
        },
      })

      // Upsert each campaign assignment
      for (const cmp of cfg.campaigns) {
        await tx.userCampaignAssignment.upsert({
          where: {
            userId_roleId_campaignId: {
              userId,
              roleId: cfg.roleId,
              campaignId: cmp.campaignId,
            },
          },
          create: {
            userId,
            roleId: cfg.roleId,
            campaignId: cmp.campaignId,
            assignNewLeads: cmp.assignNewLeads,
            backfillExistingLeads: cmp.backfillExistingLeads,
          },
          update: {
            assignNewLeads: cmp.assignNewLeads,
            backfillExistingLeads: cmp.backfillExistingLeads,
          },
        })

        // Auto-enable the matching LeadCampaignRoleToggle. When an admin
        // puts a user on role R for campaign C via User Management, the
        // campaign's Role Assignment toggle for R should turn ON so the
        // role appears on every lead's Team tab for that campaign.
        // We never force it OFF from this path — admins can still disable
        // a role on a campaign directly from the Edit Lead Campaign screen.
        await (tx as any).leadCampaignRoleToggle.upsert({
          where: {
            leadCampaignId_roleId: {
              leadCampaignId: cmp.campaignId,
              roleId: cfg.roleId,
            },
          },
          create: {
            leadCampaignId: cmp.campaignId,
            roleId: cfg.roleId,
            enabled: true,
          },
          update: { enabled: true },
        })
      }
    }

    // 5a. Reassignment pass — BEFORE we drop this user's team/task/primary
    //     rows, hand them to the replacement user the admin picked (if any).
    //     Running in-transaction means either the reassignment + removal
    //     both succeed or both roll back.
    for (const pair of removedPairs) {
      const replacementUserId = reassignMap.get(`${pair.roleId}:${pair.campaignId}`)
      if (!replacementUserId) continue // null or undefined → leave unassigned

      // (i) Reassign PropertyTeamAssignment rows from old user → replacement.
      //     If the replacement already holds that role on a property, delete
      //     the outgoing user's row to avoid the @@unique violation.
      const teamRows = await (tx as any).propertyTeamAssignment.findMany({
        where: {
          userId,
          roleId: pair.roleId,
          property: { leadCampaignId: pair.campaignId },
        },
        select: { id: true, propertyId: true },
      }) as Array<{ id: string; propertyId: string }>

      for (const row of teamRows) {
        const collision = await (tx as any).propertyTeamAssignment.findUnique({
          where: {
            propertyId_roleId: { propertyId: row.propertyId, roleId: pair.roleId },
          },
          select: { userId: true },
        }) as { userId: string } | null
        if (collision && collision.userId === replacementUserId) {
          // Replacement already has it — just drop the outgoing user's row
          await (tx as any).propertyTeamAssignment.delete({ where: { id: row.id } })
        } else {
          await (tx as any).propertyTeamAssignment.update({
            where: { id: row.id },
            data: { userId: replacementUserId },
          })
        }
      }

      // (ii) Reassign primary-assignee leads (property.assignedToId) on this campaign
      const primaryCount = await tx.property.updateMany({
        where: {
          leadCampaignId: pair.campaignId,
          assignedToId: userId,
        },
        data: { assignedToId: replacementUserId },
      })

      // (iii) Reassign PENDING tasks on this campaign
      const taskCount = await tx.task.updateMany({
        where: {
          assignedToId: userId,
          status: 'PENDING',
          property: { leadCampaignId: pair.campaignId },
        },
        data: { assignedToId: replacementUserId },
      })

      if (teamRows.length > 0 || primaryCount.count > 0 || taskCount.count > 0) {
        console.log(
          `[role-configs] reassigned ${teamRows.length} team slot(s), ${primaryCount.count} primary assignee(s), ${taskCount.count} task(s) from ${userId} → ${replacementUserId} on campaign ${pair.campaignId}`,
        )
      }
    }

    // 5b. For every removed (role, campaign) pair WITHOUT a reassignment
    //     (or where rows remain after the reassignment above), drop the
    //     user's PropertyTeamAssignment rows.
    for (const pair of removedPairs) {
      const orphaned = await (tx as any).propertyTeamAssignment.findMany({
        where: {
          userId,
          roleId: pair.roleId,
          property: { leadCampaignId: pair.campaignId },
        },
        select: { propertyId: true },
      }) as Array<{ propertyId: string }>

      if (orphaned.length > 0) {
        await (tx as any).propertyTeamAssignment.deleteMany({
          where: {
            userId,
            roleId: pair.roleId,
            property: { leadCampaignId: pair.campaignId },
          },
        })
        for (const row of orphaned) {
          cleanupEvents.push({ propertyId: row.propertyId, roleId: pair.roleId, campaignId: pair.campaignId })
        }
      }
    }
    })

    // Fire-and-forget audit events for cleanup (outside the transaction)
    for (const evt of cleanupEvents) {
      void emitEvent({
        type: DomainEvents.TEAM_MEMBER_REMOVED,
        propertyId: evt.propertyId,
        userId,
        actorType: 'system',
        payload: {
          roleId: evt.roleId,
          removedUserId: userId,
          reason: 'user_access_revoked',
          campaignId: evt.campaignId,
        },
      })
    }

    // Fire-and-forget backfill: for every campaign where EXISTING LEADS = Yes,
    // fan out the team auto-populate in a single batch + backfill primary
    // assignees for unassigned leads. Both pieces share a single eligibility
    // load per campaign (see autoPopulateTeamForCampaign), so total cost is
    // O(campaigns) queries instead of O(properties × roles).
    if (backfillCampaignIds.size > 0) {
      const campaignIds = Array.from(backfillCampaignIds)
      void (async () => {
        try {
          const results = await Promise.all(
            campaignIds.map((cid) => autoPopulateTeamForCampaign(cid, userId)),
          )

          // Primary-assignee backfill: for unassigned leads on these campaigns,
          // round-robin a user from the assignNewLeads pool. Load once per
          // campaign — pickAssigneeForNewLead already does its own query.
          let primaryFills = 0
          const unassigned = await prisma.property.findMany({
            where: {
              leadCampaignId: { in: campaignIds },
              assignedToId: null,
            },
            select: { id: true, leadCampaignId: true },
          })
          for (const p of unassigned) {
            if (!p.leadCampaignId) continue
            const picked = await pickAssigneeForNewLead(p.leadCampaignId)
            if (!picked) continue
            await prisma.property
              .update({ where: { id: p.id }, data: { assignedToId: picked } })
              .catch((err) => console.error('[role-configs] primary backfill failed:', err))
            primaryFills++
          }

          const totalSlots = results.reduce((s, r) => s + r.slotsFilled, 0)
          const totalScanned = results.reduce((s, r) => s + r.propertiesScanned, 0)
          console.log(
            `[role-configs] backfill complete — ${totalSlots} team slot(s) filled across ${totalScanned} lead(s), ${primaryFills} primary assignment(s) on ${campaignIds.length} campaign(s)`,
          )
        } catch (err) {
          console.error('[role-configs] backfill failed:', err)
        }
      })()
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[role-configs] save failed:', err)
    return NextResponse.json(
      { error: err?.message ?? 'Failed to save role configurations' },
      { status: 500 },
    )
  }
}
