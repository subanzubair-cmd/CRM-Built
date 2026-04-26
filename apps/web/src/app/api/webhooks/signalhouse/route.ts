import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/webhooks/signalhouse — Signal House inbound SMS / voice.
 *
 * Stub. Signal House inbound webhook integration is on the roadmap; until
 * the payload format + signature scheme are wired up, we accept and log
 * the payload so dashboard configuration tests succeed.
 *
 * When implementing:
 *   1. Pull config from getActiveCommConfig() (apiToken + accountId)
 *   2. Verify HMAC signature (Signal House uses sharedSecret-based HMAC)
 *   3. Map payload to the unified Message / ActiveCall schema (same model
 *      we use for Twilio + Telnyx — keeps Inbox/Calls views provider-agnostic)
 */
export async function POST(req: NextRequest) {
  try {
    const text = await req.text()
    console.log('[webhook/signalhouse] received', text.slice(0, 500))
  } catch (err) {
    console.error('[webhook/signalhouse]', err)
  }
  return NextResponse.json({ ok: true, note: 'stub — Signal House handler not yet implemented' })
}
