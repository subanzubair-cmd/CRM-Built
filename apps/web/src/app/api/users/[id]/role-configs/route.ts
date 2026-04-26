import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  UserRoleConfig,
  UserCampaignAssignment,
  LeadCampaign,
  LeadCampaignRoleToggle,
  PropertyTeamAssignment,
  Property,
  Task,
  Role,
  Op,
  literal,
  sequelize,
} from '@crm/database'
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

const ReassignmentSchema = z.object({
  roleId: z.string().min(1),
  campaignId: z.string().min(1),
  reassignToUserId: z.string().nullable(),
})

const UpsertBodySchema = z.object({
  configs: z.array(RoleConfigSchema),
  reassignments: z.array(ReassignmentSchema).optional(),
})

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'users.view')
  if (deny) return deny

  const { id: userId } = await params

  const [roleConfigs, assignments] = await Promise.all([
    UserRoleConfig.findAll({
      where: { userId },
      include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
      order: [['createdAt', 'ASC']],
    }),
    UserCampaignAssignment.findAll({
      where: { userId },
      include: [
        { model: LeadCampaign, as: 'campaign', attributes: ['id', 'name', 'type'] },
        { model: Role, as: 'role', attributes: ['id', 'name'] },
      ],
    }),
  ])

  const roleConfigsPlain = roleConfigs.map((rc) => rc.get({ plain: true }) as any)
  const assignmentsPlain = assignments.map((a) => a.get({ plain: true }) as any)

  const data = roleConfigsPlain.map((rc: any) => {
    const campaignsForRole = assignmentsPlain
      .filter((a) => a.roleId === rc.roleId)
      .flatMap((a) => {
        if (!a.campaign) return []
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

  const reassignMap = new Map<string, string | null>()
  for (const r of reassignments) {
    reassignMap.set(`${r.roleId}:${r.campaignId}`, r.reassignToUserId)
  }

  const beforeAssignments = await UserCampaignAssignment.findAll({
    where: { userId },
    attributes: ['roleId', 'campaignId'],
    raw: true,
  }) as unknown as Array<{ roleId: string; campaignId: string }>

  const keepPairs = new Set<string>()
  for (const cfg of configs) {
    for (const cmp of cfg.campaigns) {
      keepPairs.add(`${cfg.roleId}:${cmp.campaignId}`)
    }
  }
  const removedPairs = beforeAssignments.filter(
    (a) => !keepPairs.has(`${a.roleId}:${a.campaignId}`),
  )

  const backfillCampaignIds = new Set<string>()
  for (const cfg of configs) {
    for (const cmp of cfg.campaigns) {
      if (cmp.backfillExistingLeads) backfillCampaignIds.add(cmp.campaignId)
    }
  }

  try {
    const cleanupEvents: Array<{ propertyId: string; roleId: string; campaignId: string }> = []

    await sequelize.transaction(async (tx) => {
      for (const cfg of configs) {
        const [row, created] = await UserRoleConfig.findOrCreate({
          where: { userId, roleId: cfg.roleId },
          defaults: { userId, roleId: cfg.roleId, leadAccessEnabled: cfg.leadAccessEnabled } as any,
          transaction: tx,
        })
        if (!created) {
          await row.update({ leadAccessEnabled: cfg.leadAccessEnabled }, { transaction: tx })
        }
      }

      await UserRoleConfig.destroy({
        where: {
          userId,
          ...(keepRoleIds.length > 0 ? { roleId: { [Op.notIn]: keepRoleIds } } : {}),
        },
        transaction: tx,
      })

      if (keepRoleIds.length > 0) {
        await UserCampaignAssignment.destroy({
          where: { userId, roleId: { [Op.notIn]: keepRoleIds } },
          transaction: tx,
        })
      } else {
        await UserCampaignAssignment.destroy({ where: { userId }, transaction: tx })
      }

      for (const cfg of configs) {
        const keepCampaignIds = cfg.campaigns.map((c) => c.campaignId)

        await UserCampaignAssignment.destroy({
          where: {
            userId,
            roleId: cfg.roleId,
            ...(keepCampaignIds.length > 0
              ? { campaignId: { [Op.notIn]: keepCampaignIds } }
              : {}),
          },
          transaction: tx,
        })

        for (const cmp of cfg.campaigns) {
          const [row, created] = await UserCampaignAssignment.findOrCreate({
            where: { userId, roleId: cfg.roleId, campaignId: cmp.campaignId },
            defaults: {
              userId,
              roleId: cfg.roleId,
              campaignId: cmp.campaignId,
              assignNewLeads: cmp.assignNewLeads,
              backfillExistingLeads: cmp.backfillExistingLeads,
            } as any,
            transaction: tx,
          })
          if (!created) {
            await row.update({
              assignNewLeads: cmp.assignNewLeads,
              backfillExistingLeads: cmp.backfillExistingLeads,
            }, { transaction: tx })
          }

          const [toggle, toggleCreated] = await LeadCampaignRoleToggle.findOrCreate({
            where: { leadCampaignId: cmp.campaignId, roleId: cfg.roleId },
            defaults: {
              leadCampaignId: cmp.campaignId,
              roleId: cfg.roleId,
              enabled: true,
            } as any,
            transaction: tx,
          })
          if (!toggleCreated) {
            await toggle.update({ enabled: true }, { transaction: tx })
          }
        }
      }

      for (const pair of removedPairs) {
        const replacementUserId = reassignMap.get(`${pair.roleId}:${pair.campaignId}`)
        if (!replacementUserId) continue

        const propIdSubquery = `(SELECT id FROM "Property" WHERE "leadCampaignId" = ${sequelize.escape(pair.campaignId)})`
        const teamRows = await PropertyTeamAssignment.findAll({
          where: {
            userId,
            roleId: pair.roleId,
            propertyId: { [Op.in]: literal(propIdSubquery) },
          },
          attributes: ['id', 'propertyId'],
          transaction: tx,
          raw: true,
        }) as unknown as Array<{ id: string; propertyId: string }>

        for (const row of teamRows) {
          const collision = await PropertyTeamAssignment.findOne({
            where: { propertyId: row.propertyId, roleId: pair.roleId },
            attributes: ['userId'],
            transaction: tx,
            raw: true,
          }) as unknown as { userId: string } | null
          if (collision && collision.userId === replacementUserId) {
            await PropertyTeamAssignment.destroy({ where: { id: row.id }, transaction: tx })
          } else {
            await PropertyTeamAssignment.update(
              { userId: replacementUserId },
              { where: { id: row.id }, transaction: tx },
            )
          }
        }

        const [primaryCount] = await Property.update(
          { assignedToId: replacementUserId },
          {
            where: { leadCampaignId: pair.campaignId, assignedToId: userId },
            transaction: tx,
          },
        )

        const [taskCount] = await Task.update(
          { assignedToId: replacementUserId },
          {
            where: {
              assignedToId: userId,
              status: 'PENDING',
              propertyId: { [Op.in]: literal(propIdSubquery) },
            },
            transaction: tx,
          },
        )

        if (teamRows.length > 0 || primaryCount > 0 || taskCount > 0) {
          console.log(
            `[role-configs] reassigned ${teamRows.length} team slot(s), ${primaryCount} primary assignee(s), ${taskCount} task(s) from ${userId} → ${replacementUserId} on campaign ${pair.campaignId}`,
          )
        }
      }

      for (const pair of removedPairs) {
        const propIdSubquery = `(SELECT id FROM "Property" WHERE "leadCampaignId" = ${sequelize.escape(pair.campaignId)})`
        const orphaned = await PropertyTeamAssignment.findAll({
          where: {
            userId,
            roleId: pair.roleId,
            propertyId: { [Op.in]: literal(propIdSubquery) },
          },
          attributes: ['propertyId'],
          transaction: tx,
          raw: true,
        }) as unknown as Array<{ propertyId: string }>

        if (orphaned.length > 0) {
          await PropertyTeamAssignment.destroy({
            where: {
              userId,
              roleId: pair.roleId,
              propertyId: { [Op.in]: literal(propIdSubquery) },
            },
            transaction: tx,
          })
          for (const row of orphaned) {
            cleanupEvents.push({ propertyId: row.propertyId, roleId: pair.roleId, campaignId: pair.campaignId })
          }
        }
      }
    })

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

    if (backfillCampaignIds.size > 0) {
      const campaignIds = Array.from(backfillCampaignIds)
      void (async () => {
        try {
          const results = await Promise.all(
            campaignIds.map((cid) => autoPopulateTeamForCampaign(cid, userId)),
          )

          let primaryFills = 0
          const unassigned = await Property.findAll({
            where: {
              leadCampaignId: { [Op.in]: campaignIds },
              assignedToId: null,
            },
            attributes: ['id', 'leadCampaignId'],
            raw: true,
          }) as unknown as Array<{ id: string; leadCampaignId: string | null }>
          for (const p of unassigned) {
            if (!p.leadCampaignId) continue
            const picked = await pickAssigneeForNewLead(p.leadCampaignId)
            if (!picked) continue
            await Property.update({ assignedToId: picked }, { where: { id: p.id } })
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
