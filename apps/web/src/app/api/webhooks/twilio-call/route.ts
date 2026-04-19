import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/webhooks/twilio-call
 *
 * Receives Twilio call status callbacks.
 * Twilio sends form-encoded body with fields like:
 *   CallSid, CallStatus, ConferenceSid, To, From, Direction
 *
 * No auth required — Twilio posts directly.
 * In production, validate X-Twilio-Signature (same pattern as webhooks/twilio).
 */
export async function POST(req: NextRequest) {
  let params: Record<string, string>

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    params = await req.json()
  } else {
    // Twilio sends application/x-www-form-urlencoded
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
  // (skip validation in dev/mock mode when TWILIO_AUTH_TOKEN is absent)

  const { CallSid, CallStatus, ConferenceSid } = params

  if (!CallSid) {
    return NextResponse.json({ ok: true }) // ignore malformed
  }

  try {
    // Find the ActiveCall matching this call SID (agent or customer leg)
    const activeCall = await (prisma as any).activeCall.findFirst({
      where: {
        OR: [
          { agentCallSid: CallSid },
          { customerCallSid: CallSid },
          { supervisorCallSid: CallSid },
        ],
      },
    })

    if (!activeCall) {
      // Unknown call — ignore
      return NextResponse.json({ ok: true })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }

    // Populate conference SID when first known
    if (ConferenceSid && !activeCall.conferenceId) {
      updates.conferenceId = ConferenceSid
    }

    // Update call status
    if (CallStatus === 'ringing' && activeCall.status === 'INITIATING') {
      updates.status = 'RINGING'
    }

    if (CallStatus === 'in-progress' && activeCall.status !== 'ACTIVE') {
      updates.status = 'ACTIVE'
    }

    if (CallStatus === 'completed') {
      // Only mark COMPLETED when the agent leg ends
      if (CallSid === activeCall.agentCallSid) {
        updates.status = 'COMPLETED'
        updates.endedAt = new Date()
      }
    }

    await (prisma as any).activeCall.update({
      where: { id: activeCall.id },
      data: updates,
    })
  } catch (err) {
    console.error('[webhook/twilio-call]', err)
  }

  // Always return 200 to Twilio
  return NextResponse.json({ ok: true })
}
