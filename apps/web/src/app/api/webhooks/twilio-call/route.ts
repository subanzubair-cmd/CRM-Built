import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { ActiveCall, Op } from '@crm/database'

export async function POST(req: NextRequest) {
  let params: Record<string, string>

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    params = await req.json()
  } else {
    const text = await req.text()
    params = Object.fromEntries(new URLSearchParams(text))
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN
  const twimlHost = process.env.TWILIO_TWIML_HOST
  if (authToken && twimlHost) {
    const signature = req.headers.get('x-twilio-signature') ?? ''
    const fullUrl = `${twimlHost}/api/webhooks/twilio-call`
    const isValid = twilio.validateRequest(authToken, signature, fullUrl, params)
    if (!isValid) {
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  const { CallSid, CallStatus, ConferenceSid } = params

  if (!CallSid) {
    return NextResponse.json({ ok: true })
  }

  try {
    const activeCall = await ActiveCall.findOne({
      where: {
        [Op.or]: [
          { agentCallSid: CallSid },
          { customerCallSid: CallSid },
          { supervisorCallSid: CallSid },
        ],
      },
    })

    if (!activeCall) {
      return NextResponse.json({ ok: true })
    }
    const call = activeCall.get({ plain: true }) as any

    const updates: Record<string, unknown> = { updatedAt: new Date() }

    if (ConferenceSid && !call.conferenceId) {
      updates.conferenceId = ConferenceSid
    }

    if (CallStatus === 'ringing' && call.status === 'INITIATING') {
      updates.status = 'RINGING'
    }

    if (CallStatus === 'in-progress' && call.status !== 'ACTIVE') {
      updates.status = 'ACTIVE'
    }

    if (CallStatus === 'completed') {
      if (CallSid === call.agentCallSid) {
        updates.status = 'COMPLETED'
        updates.endedAt = new Date()
      }
    }

    await activeCall.update(updates)
  } catch (err) {
    console.error('[webhook/twilio-call]', err)
  }

  return NextResponse.json({ ok: true })
}
