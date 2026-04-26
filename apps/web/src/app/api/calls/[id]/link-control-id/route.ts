import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ActiveCall } from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'

/**
 * POST /api/calls/[id]/link-control-id  body: { controlId: string }
 *
 * Updates ActiveCall.conferenceName to the Telnyx call_control_id once
 * the WebRTC SDK creates the outbound call. Without this link, our
 * Telnyx call.hangup webhook (which matches on conferenceName) can't
 * find the row and leaves it RINGING/ACTIVE forever, polluting the
 * Live Calls panel.
 *
 * The placeholder conferenceName "webrtc-{ts}-{random}" is set by
 * /api/calls/start before the SDK has the real call_control_id;
 * this endpoint replaces it after newCall() returns.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.send')
  if (deny) return deny

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const controlId = typeof body?.controlId === 'string' ? body.controlId.trim() : ''
  if (!controlId) {
    return NextResponse.json({ error: 'controlId required' }, { status: 400 })
  }

  const [count] = await ActiveCall.update(
    { conferenceName: controlId },
    { where: { id } },
  )
  if (count === 0) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
