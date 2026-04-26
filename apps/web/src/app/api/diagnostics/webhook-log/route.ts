import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { getHits, clearHits } from '@/lib/webhook-log'

/**
 * GET  /api/diagnostics/webhook-log         → recent inbound webhook hits
 * DELETE /api/diagnostics/webhook-log       → clear the buffer
 *
 * Reads the in-process ring buffer the webhook routes write to. Used by
 * the Settings diagnostic UI to confirm whether Telnyx (or Twilio) is
 * actually hitting our URL — and what status the route returned.
 *
 * The most common failure this surfaces:
 *   - Hits ARE coming in but all return 401/403 → Public Key on the
 *     CRM doesn't match the one Telnyx is signing with. Re-copy from
 *     Mission Control → Developers → Webhook Signing.
 *   - No hits at all → the webhook URL Telnyx has saved doesn't
 *     match what we're listening on (re-run telnyx-inbound diagnostic).
 */
export async function GET(_req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny
  return NextResponse.json({ hits: getHits() })
}

export async function DELETE(_req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny
  clearHits()
  return NextResponse.json({ ok: true })
}
