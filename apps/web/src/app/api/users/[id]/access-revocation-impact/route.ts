import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  Property,
  Task,
  LeadCampaign,
  Role,
  User,
  UserCampaignAssignment,
  UserRoleConfig,
  PropertyTeamAssignment,
  Op,
  literal,
  sequelize,
} from '@crm/database'
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

  const [campaigns, roles, userRecord] = await Promise.all([
    LeadCampaign.findAll({
      where: { id: { [Op.in]: campaignIds } },
      attributes: ['id', 'name'],
      raw: true,
    }) as unknown as Promise<Array<{ id: string; name: string }>>,
    Role.findAll({
      where: { id: { [Op.in]: roleIds } },
      attributes: ['id', 'name'],
      raw: true,
    }) as unknown as Promise<Array<{ id: string; name: string }>>,
    User.findByPk(userId, { attributes: ['id', 'name'], raw: true }) as Promise<any>,
  ])

  if (!userRecord) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]))
  const roleNameById = new Map(roles.map((r) => [r.id, r.name]))

  const buckets = await Promise.all(
    removedPairs.map(async (pair) => {
      const propIdSubquery = `(SELECT id FROM "Property" WHERE "leadCampaignId" = ${sequelize.escape(pair.campaignId)})`
      const [primaryLeadCount, teamSlotCount, openTaskCount, eligibleReplacements] =
        await Promise.all([
          Property.count({
            where: { leadCampaignId: pair.campaignId, assignedToId: userId },
          }),
          PropertyTeamAssignment.count({
            where: {
              userId,
              roleId: pair.roleId,
              propertyId: { [Op.in]: literal(propIdSubquery) },
            },
          }),
          Task.count({
            where: {
              assignedToId: userId,
              status: 'PENDING',
              propertyId: { [Op.in]: literal(propIdSubquery) },
            },
          }),
          (async () => {
            const otherAssignments = await UserCampaignAssignment.findAll({
              where: {
                roleId: pair.roleId,
                campaignId: pair.campaignId,
                userId: { [Op.ne]: userId },
              },
              include: [
                {
                  model: User,
                  as: 'user',
                  where: { status: 'ACTIVE', vacationMode: false },
                  required: true,
                  attributes: ['id', 'name', 'email'],
                },
              ],
              attributes: ['userId'],
            })
            if (otherAssignments.length === 0) return [] as Array<{ id: string; name: string; email: string }>
            const plain = otherAssignments.map((o) => o.get({ plain: true }) as any)
            const otherIds = plain.map((a: any) => a.userId)
            const enabled = await UserRoleConfig.findAll({
              where: {
                userId: { [Op.in]: otherIds },
                roleId: pair.roleId,
                leadAccessEnabled: true,
              },
              attributes: ['userId'],
              raw: true,
            }) as unknown as Array<{ userId: string }>
            const enabledSet = new Set(enabled.map((e) => e.userId))
            return plain
              .filter((a: any) => enabledSet.has(a.userId))
              .map((a: any) => a.user)
              .filter((u: any): u is { id: string; name: string; email: string } => Boolean(u))
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
