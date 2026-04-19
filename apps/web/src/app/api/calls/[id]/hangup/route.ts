import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { hangupCall } from '@/lib/twilio-calls'
import { requirePermission } from '@/lib/auth-utils'

/**
 * POST /api/calls/[id]/hangup
 * Terminate a call by hanging up the agent's leg (which ends the conference).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.view')
  if (deny) return deny

  const { id } = await params

  const activeCall = await (prisma as any).activeCall.findUnique({ where: { id } })
  if (!activeCall) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }
  if (activeCall.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Call already ended' }, { status: 409 })
  }

  try {
    if (activeCall.agentCallSid) {
      await hangupCall(activeCall.agentCallSid)
    }

    await (prisma as any).activeCall.update({
      where: { id },
      data: { status: 'COMPLETED', endedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/calls/hangup]', err)
    return NextResponse.json({ error: 'Failed to end call' }, { status: 500 })
  }
}
