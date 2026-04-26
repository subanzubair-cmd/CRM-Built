import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { User } from '@crm/database'
import { z } from 'zod'
import { addWhisperParticipant, addBargeParticipant } from '@/lib/twilio-calls'
import { requirePermission } from '@/lib/auth-utils'

const CoachSchema = z.object({
  mode: z.enum(['WHISPER', 'BARGE']),
})

/**
 * POST /api/calls/[id]/coach
 * Join a live call as supervisor in whisper (coach) or barge (full participant) mode.
 * Supervisor must have User.phone set.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.view')
  if (deny) return deny

  const supervisorId = ((session as any)?.user?.id ?? '') as string
  const { id } = await params

  const supervisor = await User.findByPk(supervisorId, {
    attributes: ['phone', 'name'],
  })

  if (!supervisor?.phone) {
    return NextResponse.json(
      { error: 'Your profile must have a phone number set to join calls. Go to Settings → Profile.' },
      { status: 422 },
    )
  }

  const body = await req.json()
  const parsed = CoachSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { mode } = parsed.data

  const activeCall = await (prisma as any).activeCall.findUnique({ where: { id } })
  if (!activeCall) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }
  if (activeCall.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Call has already ended' }, { status: 409 })
  }
  if (!activeCall.conferenceId) {
    return NextResponse.json(
      { error: 'Conference not yet active. Wait a moment and retry.' },
      { status: 409 },
    )
  }

  if (activeCall.supervisorCallSid) {
    return NextResponse.json(
      { error: 'A supervisor is already monitoring this call.' },
      { status: 409 },
    )
  }

  try {
    let supervisorCallSid: string

    if (mode === 'WHISPER') {
      if (!activeCall.agentCallSid) {
        return NextResponse.json({ error: 'Agent call SID not available yet' }, { status: 409 })
      }
      supervisorCallSid = await addWhisperParticipant(
        activeCall.conferenceId,
        supervisor.phone,
        activeCall.agentCallSid,
      )
    } else {
      supervisorCallSid = await addBargeParticipant(
        activeCall.conferenceId,
        supervisor.phone,
      )
    }

    await (prisma as any).activeCall.update({
      where: { id },
      data: { supervisorCallSid, supervisorMode: mode },
    })

    return NextResponse.json({ success: true, supervisorCallSid, mode })
  } catch (err) {
    console.error('[POST /api/calls/coach]', err)
    return NextResponse.json({ error: 'Failed to join call' }, { status: 500 })
  }
}
