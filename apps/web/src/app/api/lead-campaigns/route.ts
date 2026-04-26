import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  LeadCampaign,
  LeadCampaignRoleToggle,
  LeadCampaignUser,
  TwilioNumber,
  LeadSource,
  literal,
  sequelize,
} from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'

const LeadCampaignTypeEnum = z.enum(['DTS', 'DTA', 'BUYER', 'VENDOR'])
const AssignmentMethodEnum = z.enum(['ROUND_ROBIN', 'FIRST_TO_CLAIM', 'MANUAL'])

const RoleToggleSchema = z.object({
  roleId: z.string().min(1),
  enabled: z.boolean(),
})

const CreateLeadCampaignSchema = z.object({
  name: z.string().min(1).max(160).trim(),
  type: LeadCampaignTypeEnum,
  phoneNumberId: z.string().min(1),
  leadSourceId: z.string().optional().nullable(),
  callFlowName: z.string().optional().nullable(),
  assignmentMethod: AssignmentMethodEnum.optional(),
  roleToggles: z.array(RoleToggleSchema).optional(),
  assignedUserIds: z.array(z.string().min(1)).optional(),
})

export async function GET() {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  const campaigns = await LeadCampaign.findAll({
    attributes: {
      include: [
        [
          literal(`(SELECT COUNT(*) FROM "Property" p WHERE p."leadCampaignId" = "LeadCampaign"."id")`),
          '_count_properties',
        ],
      ],
      exclude: [],
    },
    include: [
      { model: TwilioNumber, as: 'phoneNumber', attributes: ['number', 'friendlyName'] },
      { model: LeadSource, as: 'leadSource', attributes: ['name'] },
    ],
    order: [['createdAt', 'DESC']],
  })

  const data = campaigns.map((c) => {
    const plain = c.get({ plain: true }) as any
    return {
      id: plain.id,
      name: plain.name,
      type: plain.type,
      callFlowName: plain.callFlowName,
      assignmentMethod: plain.assignmentMethod,
      isActive: plain.isActive,
      phoneNumber: plain.phoneNumber,
      leadSource: plain.leadSource,
      _count: { properties: Number(plain._count_properties ?? 0) },
    }
  })

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const body = await req.json()
  const parsed = CreateLeadCampaignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const {
    name,
    type,
    phoneNumberId,
    leadSourceId,
    callFlowName,
    assignmentMethod,
    roleToggles,
    assignedUserIds,
  } = parsed.data

  const existingClaim = await LeadCampaign.findOne({
    where: { phoneNumberId },
    attributes: ['id', 'name'],
    raw: true,
  }) as any
  if (existingClaim) {
    return NextResponse.json(
      { error: `Phone number already claimed by campaign "${existingClaim.name}"` },
      { status: 409 },
    )
  }

  try {
    const created = await sequelize.transaction(async (tx) => {
      const campaign = await LeadCampaign.create({
        name,
        type,
        phoneNumberId,
        leadSourceId: leadSourceId ?? null,
        callFlowName: callFlowName ?? null,
        assignmentMethod: assignmentMethod ?? 'ROUND_ROBIN',
      } as any, { transaction: tx })

      if (roleToggles && roleToggles.length > 0) {
        await LeadCampaignRoleToggle.bulkCreate(
          roleToggles.map((t) => ({
            leadCampaignId: campaign.id,
            roleId: t.roleId,
            enabled: t.enabled,
          })) as any[],
          { transaction: tx, ignoreDuplicates: true },
        )
      }

      if (assignedUserIds && assignedUserIds.length > 0) {
        await LeadCampaignUser.bulkCreate(
          assignedUserIds.map((uid) => ({
            leadCampaignId: campaign.id,
            userId: uid,
          })) as any[],
          { transaction: tx, ignoreDuplicates: true },
        )
      }

      return campaign
    })

    return NextResponse.json({ data: created.get({ plain: true }) }, { status: 201 })
  } catch (err: any) {
    if (err?.name === 'SequelizeUniqueConstraintError' || err?.parent?.code === '23505') {
      return NextResponse.json(
        { error: 'Duplicate phone number or campaign constraint' },
        { status: 409 },
      )
    }
    console.error('[lead-campaigns] create failed:', err)
    return NextResponse.json(
      { error: 'Failed to create lead campaign' },
      { status: 500 },
    )
  }
}
