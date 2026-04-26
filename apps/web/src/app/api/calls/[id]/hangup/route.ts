import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ActiveCall } from '@crm/database'
import { hangupCall } from '@/lib/twilio-calls'
import { hangupTelnyxCall } from '@/lib/telnyx-calls'
import { getActiveCommConfig } from '@/lib/comm-provider'
import { requirePermission } from '@/lib/auth-utils'

/**
 * POST /api/calls/[id]/hangup
 *
 * Provider-agnostic call termination. Detects whether the active call is
 * Twilio or Telnyx (call_control_id stored in conferenceName) and
 * dispatches to the right provider API.
 *
 * Designed to be reachable via navigator.sendBeacon() so the browser's
 * pagehide / unload handler can fire-and-forget a cleanup — see the
 * useCallCleanup hook on the client side. sendBeacon includes the
 * session cookie, so authn still works in that flow.
 *
 * Idempotent: returns 200 on already-completed calls so beacon retries
 * don't cascade. Returns 4xx only when the call truly doesn't exist.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.view')
  if (deny) return deny

  const { id } = await params

  const activeCall = await ActiveCall.findByPk(id)
  if (!activeCall) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }
  if (activeCall.status === 'COMPLETED') {
    // Idempotent — already terminated by an earlier hangup, webhook, or
    // beacon retry. Return 200 so sendBeacon callers don't see errors.
    return NextResponse.json({ success: true, alreadyCompleted: true })
  }

  try {
    const config = await getActiveCommConfig()
    const provider = config?.providerName ?? 'twilio'

    if (provider === 'telnyx') {
      // Telnyx call_control_id lives in conferenceName for cross-provider
      // idempotency (set by /api/webhooks/telnyx on call.initiated).
      if (activeCall.conferenceName) {
        await hangupTelnyxCall(activeCall.conferenceName)
      }
    } else {
      // Twilio (or env-fallback). Hangup of the agent's leg ends the conference.
      if (activeCall.agentCallSid) {
        await hangupCall(activeCall.agentCallSid)
      }
    }

    await activeCall.update({ status: 'COMPLETED', endedAt: new Date() })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/calls/hangup]', err)
    return NextResponse.json({ error: 'Failed to end call' }, { status: 500 })
  }
}
