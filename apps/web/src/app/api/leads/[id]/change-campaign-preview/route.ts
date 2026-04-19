import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/leads/[id]/change-campaign-preview?newCampaignId=X
 *
 * Returns the data needed by the Change Campaign modal:
 *   - currentCampaign: {id, name, type} — the lead's current leadCampaign
 *   - newCampaign: {id, name, type}     — the campaign the admin wants to switch to
 *   - currentTeam: [{roleId, roleName, userId, userName}]
 *       → who holds each role on this lead via PropertyTeamAssignment today
 *   - newCampaignRoles: [{roleId, roleName}]
 *       → every role enabled on the NEW campaign (the dropdown options)
 */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny

  const { id } = await params
  const newCampaignId = req.nextUrl.searchParams.get('newCampaignId')
  if (!newCampaignId) {
    return NextResponse.json({ error: 'newCampaignId required' }, { status: 422 })
  }

  const [property, newCampaign] = await Promise.all([
    prisma.property.findUnique({
      where: { id },
      select: {
        id: true,
        leadCampaignId: true,
        leadCampaign: { select: { id: true, name: true, type: true } },
        teamAssignments: {
          select: {
            roleId: true,
            userId: true,
            role: { select: { name: true } },
            user: { select: { name: true, email: true } },
          },
        },
      },
    }),
    prisma.leadCampaign.findUnique({
      where: { id: newCampaignId },
      select: {
        id: true,
        name: true,
        type: true,
        roleToggles: {
          where: { enabled: true },
          select: { roleId: true, role: { select: { name: true } } },
        },
      },
    }),
  ])

  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  if (!newCampaign) return NextResponse.json({ error: 'Target campaign not found' }, { status: 404 })

  const currentTeam = property.teamAssignments.map((a) => ({
    roleId: a.roleId,
    roleName: a.role.name,
    userId: a.userId,
    userName: a.user?.name ?? 'Unassigned',
    userEmail: a.user?.email ?? '',
  }))

  const newCampaignRoles = newCampaign.roleToggles.map((t) => ({
    roleId: t.roleId,
    roleName: t.role.name,
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
