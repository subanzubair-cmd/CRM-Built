import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission, hasPermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/calls/[id]/reject
 * Reject an inbound ringing call. Authorization mirrors /answer:
 * admin, assigned agent, property assignee, or team member.
 * Atomic transition prevents races with a concurrent /answer.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.send')
  if (deny) return deny
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params
  const body = await req.json().catch(() => ({}))

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
        { error: 'You are not authorized to reject this call.' },
        { status: 403 },
      )
    }
  }

  const updated = await (prisma as any).activeCall.updateMany({
    where: { id, status: { in: ['INITIATING', 'RINGING'] } },
    data: {
      status: 'REJECTED',
      rejectedReason: body.reason ?? 'declined',
      endedAt: new Date(),
    },
  })

  if (updated.count === 0) {
    return NextResponse.json(
      { error: 'Call is no longer available to reject.' },
      { status: 409 },
    )
  }

  const refreshed = await (prisma as any).activeCall.findUnique({ where: { id } })
  return NextResponse.json({ success: true, data: refreshed })
}
