import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import {
  Property,
  LeadCampaign,
  LeadCampaignRoleToggle,
  UserCampaignAssignment,
  PropertyTeamAssignment,
  UserRoleConfig,
  Role,
  User,
  Op,
  sequelize,
} from '@crm/database'
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

    const [propertyRow, currentAssignments] = await Promise.all([
      Property.findByPk(id, {
        attributes: ['id', 'leadCampaignId'],
        include: [
          {
            model: LeadCampaign,
            as: 'leadCampaign',
            attributes: ['id'],
            required: false,
            include: [
              {
                model: LeadCampaignRoleToggle,
                as: 'roleToggles',
                where: { enabled: true },
                required: false,
                attributes: ['roleId'],
                include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
              },
              {
                model: UserCampaignAssignment,
                as: 'userAssignments',
                attributes: ['userId', 'roleId'],
                required: false,
              },
            ],
          },
        ],
      }),
      PropertyTeamAssignment.findAll({
        where: { propertyId: id },
        attributes: ['roleId', 'userId'],
        raw: true,
      }) as Promise<Array<{ roleId: string; userId: string }>>,
    ])

    if (!propertyRow) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const property = propertyRow.get({ plain: true }) as any
    if (!property.leadCampaignId || !property.leadCampaign) {
      return NextResponse.json({ data: { rows: [] } })
    }

    const campaign = property.leadCampaign
    const assignedByRole = new Map<string, string>()
    for (const a of currentAssignments) assignedByRole.set(a.roleId, a.userId)

    const candidatePairs: Array<{ userId: string; roleId: string }> = campaign.userAssignments ?? []
    const eligibleSet = new Set<string>()
    if (candidatePairs.length > 0) {
      const roleConfigs = await UserRoleConfig.findAll({
        where: {
          [Op.or]: candidatePairs.map((p) => ({ userId: p.userId, roleId: p.roleId })),
          leadAccessEnabled: true,
        },
        attributes: ['userId', 'roleId'],
        raw: true,
      }) as unknown as Array<{ userId: string; roleId: string }>
      for (const c of roleConfigs) eligibleSet.add(`${c.userId}:${c.roleId}`)
    }

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
      ? await User.findAll({
          where: { id: { [Op.in]: allEligibleUserIds }, status: 'ACTIVE' },
          attributes: ['id', 'name', 'email'],
          order: [['name', 'ASC']],
          raw: true,
        }) as unknown as Array<{ id: string; name: string; email: string }>
      : []
    const userById = new Map(users.map((u) => [u.id, u]))

    const rows = (campaign.roleToggles ?? [])
      .map((toggle: any) => {
        const roleId = toggle.roleId
        const ids = eligibleUserIdsByRole.get(roleId) ?? []
        const rowUsers = ids
          .map((uid) => userById.get(uid))
          .filter((u): u is { id: string; name: string; email: string } => Boolean(u))
          .sort((a, b) => a.name.localeCompare(b.name))
        return {
          roleId,
          roleName: toggle.role?.name ?? '',
          users: rowUsers,
          assignedUserId: assignedByRole.get(roleId) ?? null,
        }
      })
      .filter((row: any) => row.users.length > 0 || row.assignedUserId !== null)

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

    const beforeRows = await PropertyTeamAssignment.findAll({
      where: { propertyId: id },
      include: [{ model: Role, as: 'role', attributes: ['name'] }],
      raw: true,
      nest: true,
    }) as unknown as Array<{ roleId: string; userId: string; role: { name: string } }>
    const beforeByRole = new Map(beforeRows.map((b) => [b.roleId, b]))

    const missingRoleIds = assignments
      .filter((a) => !beforeByRole.has(a.roleId))
      .map((a) => a.roleId)
    const addedRoles = missingRoleIds.length
      ? await Role.findAll({
          where: { id: { [Op.in]: missingRoleIds } },
          attributes: ['id', 'name'],
          raw: true,
        }) as unknown as Array<{ id: string; name: string }>
      : []
    const roleNameById = new Map<string, string>(addedRoles.map((r) => [r.id, r.name]))
    for (const b of beforeRows) roleNameById.set(b.roleId, b.role.name)

    await sequelize.transaction(async (tx) => {
      for (const a of assignments) {
        if (a.userId === null) {
          await PropertyTeamAssignment.destroy({
            where: { propertyId: id, roleId: a.roleId },
            transaction: tx,
          })
        } else {
          const [row, created] = await PropertyTeamAssignment.findOrCreate({
            where: { propertyId: id, roleId: a.roleId },
            defaults: { propertyId: id, roleId: a.roleId, userId: a.userId },
            transaction: tx,
          })
          if (!created) {
            await row.update({ userId: a.userId }, { transaction: tx })
          }
        }
      }
    })

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
