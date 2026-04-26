import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  LeadCampaign,
  LeadCampaignRoleToggle,
  LeadCampaignUser,
  TwilioNumber,
  LeadSource,
  Property,
  Role,
  User,
  Op,
  sequelize,
} from '@crm/database'
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

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  const { id } = await params

  const campaign = await LeadCampaign.findByPk(id, {
    include: [
      { model: TwilioNumber, as: 'phoneNumber' },
      { model: LeadSource, as: 'leadSource' },
      {
        model: LeadCampaignRoleToggle,
        as: 'roleToggles',
        include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
      },
      {
        model: LeadCampaignUser,
        as: 'assignedUsers',
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      },
    ],
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const plain = campaign.get({ plain: true }) as any
  const propertiesCount = await Property.count({ where: { leadCampaignId: id } })
  plain._count = { properties: propertiesCount }

  return NextResponse.json({ data: plain })
}

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

  const existingRow = await LeadCampaign.findByPk(id, {
    include: [
      { model: TwilioNumber, as: 'phoneNumber', attributes: ['number'] },
      { model: LeadSource, as: 'leadSource', attributes: ['name'] },
    ],
  })
  if (!existingRow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const existing = existingRow.get({ plain: true }) as any

  const { roleToggles, assignedUserIds, ...rest } = parsed.data

  if (rest.phoneNumberId && rest.phoneNumberId !== existing.phoneNumberId) {
    const conflict = await LeadCampaign.findOne({
      where: { phoneNumberId: rest.phoneNumberId },
      attributes: ['id', 'name'],
      raw: true,
    }) as any
    if (conflict && conflict.id !== id) {
      return NextResponse.json(
        { error: `Phone number already claimed by campaign "${conflict.name}"` },
        { status: 409 },
      )
    }
  }

  const oldPhoneNumber = existing.phoneNumber?.number ?? null
  const oldLeadSourceName = existing.leadSource?.name ?? null

  try {
    const updated = await sequelize.transaction(async (tx) => {
      await LeadCampaign.update(rest as any, { where: { id }, transaction: tx })

      if (roleToggles) {
        await LeadCampaignRoleToggle.destroy({
          where: { leadCampaignId: id },
          transaction: tx,
        })
        if (roleToggles.length > 0) {
          await LeadCampaignRoleToggle.bulkCreate(
            roleToggles.map((t) => ({
              leadCampaignId: id,
              roleId: t.roleId,
              enabled: t.enabled,
            })) as any[],
            { transaction: tx, ignoreDuplicates: true },
          )
        }
      }

      if (assignedUserIds) {
        await LeadCampaignUser.destroy({
          where: { leadCampaignId: id },
          transaction: tx,
        })
        if (assignedUserIds.length > 0) {
          await LeadCampaignUser.bulkCreate(
            assignedUserIds.map((uid) => ({
              leadCampaignId: id,
              userId: uid,
            })) as any[],
            { transaction: tx, ignoreDuplicates: true },
          )
        }
      }

      const fresh = await LeadCampaign.findByPk(id, { transaction: tx })
      return fresh?.get({ plain: true })
    })

    void (async () => {
      try {
        if (rest.phoneNumberId !== undefined && rest.phoneNumberId !== existing.phoneNumberId) {
          const newNumberRow = rest.phoneNumberId
            ? await TwilioNumber.findByPk(rest.phoneNumberId, {
                attributes: ['number'],
              })
            : null
          const newNumber = newNumberRow?.number ?? null

          if (newNumber !== oldPhoneNumber) {
            await Property.update(
              { defaultOutboundNumber: newNumber },
              {
                where: {
                  leadCampaignId: id,
                  defaultOutboundNumber: oldPhoneNumber,
                },
              },
            )
          }
        }

        if (rest.leadSourceId !== undefined) {
          const newSourceName = rest.leadSourceId
            ? ((await LeadSource.findByPk(rest.leadSourceId, {
                attributes: ['name'],
                raw: true,
              })) as any)?.name ?? null
            : null

          if (newSourceName !== oldLeadSourceName) {
            await Property.update(
              { source: newSourceName },
              {
                where: {
                  leadCampaignId: id,
                  source: oldLeadSourceName,
                },
              },
            )
          }
        }
      } catch (e) {
        console.error('[lead-campaigns] propagation failed:', e)
      }
    })()

    return NextResponse.json({ data: updated })
  } catch (err: any) {
    if (err?.name === 'SequelizeUniqueConstraintError' || err?.parent?.code === '23505') {
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

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params

  const existing = await LeadCampaign.findByPk(id, { raw: true })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    await LeadCampaign.destroy({ where: { id } })
  } catch (err: any) {
    console.error('[lead-campaigns] delete failed:', err)
    return NextResponse.json(
      { error: 'Failed to delete lead campaign' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true })
}
