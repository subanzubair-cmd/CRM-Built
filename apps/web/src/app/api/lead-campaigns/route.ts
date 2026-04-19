import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
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

/**
 * GET /api/lead-campaigns
 * Returns all lead campaigns with supporting relation summaries.
 */
export async function GET() {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  const campaigns = await (prisma as any).leadCampaign.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      callFlowName: true,
      assignmentMethod: true,
      isActive: true,
      phoneNumber: { select: { number: true, friendlyName: true } },
      leadSource: { select: { name: true } },
      _count: { select: { properties: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ data: campaigns })
}

/**
 * POST /api/lead-campaigns
 * Creates a new lead campaign (claims the phone number) and persists its
 * role toggle matrix.
 */
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

  // Guard: phone number must not already be claimed by another campaign
  const existingClaim = await (prisma as any).leadCampaign.findUnique({
    where: { phoneNumberId },
    select: { id: true, name: true },
  })
  if (existingClaim) {
    return NextResponse.json(
      { error: `Phone number already claimed by campaign "${existingClaim.name}"` },
      { status: 409 },
    )
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const campaign = await (tx as any).leadCampaign.create({
        data: {
          name,
          type,
          phoneNumberId,
          leadSourceId: leadSourceId ?? null,
          callFlowName: callFlowName ?? null,
          assignmentMethod: assignmentMethod ?? 'ROUND_ROBIN',
        },
      })

      if (roleToggles && roleToggles.length > 0) {
        await (tx as any).leadCampaignRoleToggle.createMany({
          data: roleToggles.map((t) => ({
            leadCampaignId: campaign.id,
            roleId: t.roleId,
            enabled: t.enabled,
          })),
          skipDuplicates: true,
        })
      }

      if (assignedUserIds && assignedUserIds.length > 0) {
        await (tx as any).leadCampaignUser.createMany({
          data: assignedUserIds.map((uid) => ({
            leadCampaignId: campaign.id,
            userId: uid,
          })),
          skipDuplicates: true,
        })
      }

      return campaign
    })

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err: any) {
    if (err?.code === 'P2002') {
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
