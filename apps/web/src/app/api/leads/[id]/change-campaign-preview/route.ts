import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  Property,
  LeadCampaign,
  LeadCampaignRoleToggle,
  PropertyTeamAssignment,
  Role,
  User,
} from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny

  const { id } = await params
  const newCampaignId = req.nextUrl.searchParams.get('newCampaignId')
  if (!newCampaignId) {
    return NextResponse.json({ error: 'newCampaignId required' }, { status: 422 })
  }

  const [propertyRow, newCampaignRow] = await Promise.all([
    Property.findByPk(id, {
      attributes: ['id', 'leadCampaignId'],
      include: [
        { model: LeadCampaign, as: 'leadCampaign', attributes: ['id', 'name', 'type'], required: false },
        {
          model: PropertyTeamAssignment,
          as: 'teamAssignments',
          attributes: ['roleId', 'userId'],
          include: [
            { model: Role, as: 'role', attributes: ['name'] },
            { model: User, as: 'user', attributes: ['name', 'email'] },
          ],
        },
      ],
    }),
    LeadCampaign.findByPk(newCampaignId, {
      attributes: ['id', 'name', 'type'],
      include: [
        {
          model: LeadCampaignRoleToggle,
          as: 'roleToggles',
          where: { enabled: true },
          required: false,
          attributes: ['roleId'],
          include: [{ model: Role, as: 'role', attributes: ['name'] }],
        },
      ],
    }),
  ])

  if (!propertyRow) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  if (!newCampaignRow) return NextResponse.json({ error: 'Target campaign not found' }, { status: 404 })

  const property = propertyRow.get({ plain: true }) as any
  const newCampaign = newCampaignRow.get({ plain: true }) as any

  const currentTeam = (property.teamAssignments ?? []).map((a: any) => ({
    roleId: a.roleId,
    roleName: a.role?.name ?? '',
    userId: a.userId,
    userName: a.user?.name ?? 'Unassigned',
    userEmail: a.user?.email ?? '',
  }))

  const newCampaignRoles = (newCampaign.roleToggles ?? []).map((t: any) => ({
    roleId: t.roleId,
    roleName: t.role?.name ?? '',
  }))

  return NextResponse.json({
    currentCampaign: property.leadCampaign ?? null,
    newCampaign: {
      id: newCampaign.id,
      name: newCampaign.name,
      type: newCampaign.type,
    },
    currentTeam,
    newCampaignRoles,
  })
}
