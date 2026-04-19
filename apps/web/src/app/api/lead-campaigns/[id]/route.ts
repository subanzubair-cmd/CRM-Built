import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const LeadCampaignTypeEnum = z.enum(['DTS', 'DTA', 'BUYER', 'VENDOR'])
const AssignmentMethodEnum = z.enum(['ROUND_ROBIN', 'FIRST_TO_CLAIM', 'MANUAL'])

const RoleToggleSchema = z.object({
  roleId: z.string().min(1),
  enabled: z.boolean(),
})

const UpdateLeadCampaignSchema = z.object({
  name: z.string().min(1).max(160).trim().optional(),
  type: LeadCampaignTypeEnum.optional(),
  phoneNumberId: z.string().min(1).optional(),
  leadSourceId: z.string().nullable().optional(),
  callFlowName: z.string().nullable().optional(),
  assignmentMethod: AssignmentMethodEnum.optional(),
  isActive: z.boolean().optional(),
  roleToggles: z.array(RoleToggleSchema).optional(),
  assignedUserIds: z.array(z.string().min(1)).optional(),
})

/**
 * GET /api/lead-campaigns/:id
 * Full lead campaign detail including role toggles and phone number.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  const { id } = await params

  const campaign = await (prisma as any).leadCampaign.findUnique({
    where: { id },
    include: {
      phoneNumber: true,
      leadSource: true,
      roleToggles: { include: { role: { select: { id: true, name: true } } } },
      assignedUsers: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { properties: true } },
    },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data: campaign })
}

/**
 * PATCH /api/lead-campaigns/:id
 * Updates fields on the campaign; when roleToggles is provided, replaces the
 * entire toggle list.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params

  const body = await req.json()
  const parsed = UpdateLeadCampaignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const existing = await (prisma as any).leadCampaign.findUnique({
    where: { id },
    include: {
      phoneNumber: { select: { number: true } },
      leadSource: { select: { name: true } },
    },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { roleToggles, assignedUserIds, ...rest } = parsed.data

  // Guard: if swapping phone numbers, ensure the new one isn't already claimed
  if (rest.phoneNumberId && rest.phoneNumberId !== existing.phoneNumberId) {
    const conflict = await (prisma as any).leadCampaign.findUnique({
      where: { phoneNumberId: rest.phoneNumberId },
      select: { id: true, name: true },
    })
    if (conflict && conflict.id !== id) {
      return NextResponse.json(
        { error: `Phone number already claimed by campaign "${conflict.name}"` },
        { status: 409 },
      )
    }
  }

  // Compute the OLD values we need for safe propagation diffs
  const oldPhoneNumber = existing.phoneNumber?.number ?? null
  const oldLeadSourceName = existing.leadSource?.name ?? null

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const campaign = await (tx as any).leadCampaign.update({
        where: { id },
        data: rest,
      })

      if (roleToggles) {
        // Replace the toggle list
        await (tx as any).leadCampaignRoleToggle.deleteMany({
          where: { leadCampaignId: id },
        })
        if (roleToggles.length > 0) {
          await (tx as any).leadCampaignRoleToggle.createMany({
            data: roleToggles.map((t) => ({
              leadCampaignId: id,
              roleId: t.roleId,
              enabled: t.enabled,
            })),
            skipDuplicates: true,
          })
        }
      }

      if (assignedUserIds) {
        // Replace the direct-user assignment list (used for BUYER/VENDOR campaigns)
        await (tx as any).leadCampaignUser.deleteMany({
          where: { leadCampaignId: id },
        })
        if (assignedUserIds.length > 0) {
          await (tx as any).leadCampaignUser.createMany({
            data: assignedUserIds.map((uid) => ({
              leadCampaignId: id,
              userId: uid,
            })),
            skipDuplicates: true,
          })
        }
      }

      return campaign
    })

    // ─── PROPAGATION: flow campaign changes into existing leads ───
    // Only propagate when the field actually changed; never overwrite
    // user-customized values on individual leads (we match on the OLD value).
    void (async () => {
      try {
        // 1. Phone number propagation — update Property.defaultOutboundNumber
        //    only on properties where it currently equals the OLD campaign number
        //    (i.e. they haven't been manually overridden since lead creation).
        if (rest.phoneNumberId !== undefined && rest.phoneNumberId !== existing.phoneNumberId) {
          const newNumberRow = rest.phoneNumberId
            ? await prisma.twilioNumber.findUnique({
                where: { id: rest.phoneNumberId },
                select: { number: true },
              })
            : null
          const newNumber = newNumberRow?.number ?? null

          if (newNumber !== oldPhoneNumber) {
            await prisma.property.updateMany({
              where: {
                leadCampaignId: id,
                defaultOutboundNumber: oldPhoneNumber,
              },
              data: { defaultOutboundNumber: newNumber },
            })
          }
        }

        // 2. Lead source propagation — update Property.source on properties
        //    where source matches the OLD campaign source.
        if (rest.leadSourceId !== undefined) {
          const newSourceName = rest.leadSourceId
            ? (await (prisma as any).leadSource.findUnique({
                where: { id: rest.leadSourceId },
                select: { name: true },
              }))?.name ?? null
            : null

          if (newSourceName !== oldLeadSourceName) {
            await prisma.property.updateMany({
              where: {
                leadCampaignId: id,
                source: oldLeadSourceName,
              },
              data: { source: newSourceName },
            })
          }
        }
      } catch (e) {
        console.error('[lead-campaigns] propagation failed:', e)
      }
    })()

    return NextResponse.json({ data: updated })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Duplicate phone number or campaign constraint' },
        { status: 409 },
      )
    }
    console.error('[lead-campaigns] update failed:', err)
    return NextResponse.json(
      { error: 'Failed to update lead campaign' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/lead-campaigns/:id
 * Removes the campaign (cascades LeadCampaignRoleToggle). The optional
 * TwilioNumber <-> LeadCampaign relation becomes unclaimed automatically.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params

  const existing = await (prisma as any).leadCampaign.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    await (prisma as any).leadCampaign.delete({ where: { id } })
  } catch (err: any) {
    console.error('[lead-campaigns] delete failed:', err)
    return NextResponse.json(
      { error: 'Failed to delete lead campaign' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true })
}
