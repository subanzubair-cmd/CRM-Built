import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  ActiveCall,
  Property,
  PropertyTeamAssignment,
  Op,
} from '@crm/database'
import { requirePermission, hasPermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/calls/[id]/answer
 * Mark an inbound ringing call as answered. Only the assigned agent, a team
 * member on the property, or an admin may answer. Transitions status from
 * INITIATING|RINGING → ACTIVE atomically to avoid concurrent answer/reject races.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.send')
  if (deny) return deny
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params

  // Two-step: load the call, then load the property's assignedToId. The
  // original Prisma include did this via a nested `property: { select }`
  // — Sequelize handles it equivalently with an `include`, but a flat
  // followup query is simpler and matches the access pattern.
  const call = await ActiveCall.findByPk(id, {
    attributes: ['id', 'status', 'agentUserId', 'propertyId'],
  })
  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  // Authorization: admin, assigned agent, property assignee, or team member
  const isAdmin = hasPermission(session, 'admin.all')
  if (!isAdmin && call.agentUserId !== userId) {
    let isPropertyAssignee = false
    if (call.propertyId) {
      const property = await Property.findByPk(call.propertyId, {
        attributes: ['assignedToId'],
      })
      isPropertyAssignee = property?.assignedToId === userId
    }
    const teamMember = isPropertyAssignee || !call.propertyId
      ? null
      : await PropertyTeamAssignment.findOne({
          where: { propertyId: call.propertyId, userId },
          attributes: ['id'],
        })
    if (!isPropertyAssignee && !teamMember) {
      return NextResponse.json(
        { error: 'You are not authorized to answer this call.' },
        { status: 403 },
      )
    }
  }

  // Atomic transition: only succeed if still pending (prevents races)
  const [count] = await ActiveCall.update(
    { status: 'ACTIVE' },
    { where: { id, status: { [Op.in]: ['INITIATING', 'RINGING'] } } },
  )

  if (count === 0) {
    return NextResponse.json(
      { error: 'Call is no longer available to answer.' },
      { status: 409 },
    )
  }

  const refreshed = await ActiveCall.findByPk(id)
  return NextResponse.json({ success: true, data: refreshed })
}
