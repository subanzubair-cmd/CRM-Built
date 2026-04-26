import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ActiveCall } from '@crm/database'

/**
 * GET /api/calls/by-control-id?id=<call_control_id>
 *
 * Resolves a Telnyx call_control_id (or Twilio CallSid) to the matching
 * ActiveCall row id. Used by the WebRTC inbound flow: the SDK gives us
 * the SIP-level call id, and we need the CRM's row id so the recorder
 * can attach to it.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const row = await ActiveCall.findOne({
    where: { conferenceName: id },
    attributes: ['id'],
    raw: true,
  }) as { id: string } | null

  if (!row) return NextResponse.json({ id: null }, { status: 200 })
  return NextResponse.json({ id: row.id })
}
