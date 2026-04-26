import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  UserCampaignAssignment,
  LeadCampaign,
  Role,
  Op,
} from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const AssignmentSchema = z.object({
  campaignId: z.string().min(1),
  roleId: z.string().min(1),
  assignNewLeads: z.boolean().default(false),
  backfillExistingLeads: z.boolean().default(false),
})

const UpsertBodySchema = z.object({
  assignments: z.array(AssignmentSchema),
})

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'users.view')
  if (deny) return deny
  const { id } = await params

  const assignments = await UserCampaignAssignment.findAll({
    where: { userId: id },
    include: [
      { model: LeadCampaign, as: 'campaign', attributes: ['id', 'name', 'isActive', 'type'] },
      { model: Role, as: 'role', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'ASC']],
  })

  return NextResponse.json({ data: assignments.map((a) => a.get({ plain: true })) })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'users.manage')
  if (deny) return deny
  const { id: userId } = await params

  const body = await req.json()
  const parsed = UpsertBodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { assignments } = parsed.data

  const keepKeys = assignments.map((a) => `${a.campaignId}|${a.roleId}`)
  const existing = await UserCampaignAssignment.findAll({
    where: { userId },
    attributes: ['id', 'campaignId', 'roleId'],
    raw: true,
  }) as unknown as Array<{ id: string; campaignId: string; roleId: string }>
  const toDelete = existing.filter((e) => !keepKeys.includes(`${e.campaignId}|${e.roleId}`))
  if (toDelete.length > 0) {
    await UserCampaignAssignment.destroy({
      where: { id: { [Op.in]: toDelete.map((t) => t.id) } },
    })
  }

  for (const a of assignments) {
    const [row, created] = await UserCampaignAssignment.findOrCreate({
      where: { userId, roleId: a.roleId, campaignId: a.campaignId },
      defaults: {
        userId,
        roleId: a.roleId,
        campaignId: a.campaignId,
        assignNewLeads: a.assignNewLeads,
        backfillExistingLeads: a.backfillExistingLeads,
      } as any,
    })
    if (!created) {
      await row.update({
        assignNewLeads: a.assignNewLeads,
        backfillExistingLeads: a.backfillExistingLeads,
      })
    }
  }

  return NextResponse.json({ success: true })
}
