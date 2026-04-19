import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
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

  const call = await (prisma as any).activeCall.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      agentUserId: true,
      propertyId: true,
      property: { select: { assignedToId: true } },
    },
  })
  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  // Authorization: admin, assigned agent, property assignee, or team member
  const isAdmin = hasPermission(session, 'admin.all')
  if (!isAdmin && call.agentUserId !== userId) {
    const isPropertyAssignee = call.property?.assignedToId === userId
    const teamMember = isPropertyAssignee || !call.propertyId
      ? null
      : await (prisma as any).propertyTeamAssignment.findFirst({
          where: { propertyId: call.propertyId, userId },
          select: { id: true },
        })
    if (!isPropertyAssignee && !teamMember) {
      return NextResponse.json(
        { error: 'You are not authorized to answer this call.' },
        { status: 403 },
      )
    }
  }

  // Atomic transition: only succeed if still pending (prevents races)
  const updated = await (prisma as any).activeCall.updateMany({
    where: { id, status: { in: ['INITIATING', 'RINGING'] } },
    data: { status: 'ACTIVE' },
  })

  if (updated.count === 0) {
    return NextResponse.json(
      { error: 'Call is no longer available to answer.' },
      { status: 409 },
    )
  }

  const refreshed = await (prisma as any).activeCall.findUnique({ where: { id } })
  return NextResponse.json({ success: true, data: refreshed })
}
