import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getActiveCommConfig } from '@/lib/comm-provider'
import { requirePermission } from '@/lib/auth-utils'

/**
 * GET /api/calls/credentials
 *
 * Mints a short-lived Telnyx WebRTC login token so the browser softphone
 * can register as a SIP endpoint. Required for the WebRTC migration —
 * agents dial from the browser instead of having Telnyx call their phone.
 *
 * Telnyx flow (two-step, both server-side so the API key never reaches
 * the browser):
 *
 *   1. POST /v2/telephony_credentials  with the SIP Connection UUID
 *      → returns a credential record { id, sip_username, sip_password,
 *        expires_at }
 *
 *   2. POST /v2/telephony_credentials/{id}/token
 *      → returns a JWT (plain text body) the WebRTC SDK uses for login
 *
 * The browser receives only the JWT — credentials and API key stay server-side.
 *
 * Required Telnyx setup (one-time, in Mission Control):
 *   - Voice → Voice API & Apps → Applications → Create New
 *     • Type: Voice API
 *     • Webhook URL: https://YOUR-DOMAIN/api/webhooks/telnyx
 *     • Save → copy "Application ID" → paste into Settings → SMS &
 *       Phone Number Integration → Voice Application ID
 *   - Voice → SIP Connections → Create
 *     • Connection Type: Credentials
 *     • Save → copy "Connection ID" → paste into Settings → Voice
 *       Connection ID
 *   - Assign your numbers to the Voice API Application
 */
export async function GET() {
  const session = await auth()
  const deny = requirePermission(session, 'comms.send')
  if (deny) return deny

  const config = await getActiveCommConfig()
  if (config?.providerName !== 'telnyx' || !config.apiKey) {
    return NextResponse.json(
      { error: 'Telnyx is not the active provider, or API key is missing.' },
      { status: 400 },
    )
  }
  // A Voice API Application IS a Credential Connection in Telnyx — its
  // ID serves both roles. We accept voiceConnectionId as an override for
  // advanced setups (separate SIP Connection just for WebRTC) but default
  // to voiceApplicationId when it isn't set, since most operators only
  // have the Voice API Application ID.
  const connectionId = config.voiceConnectionId || config.voiceApplicationId
  if (!connectionId) {
    return NextResponse.json(
      {
        error:
          'Voice Application ID is not configured. Open Settings → SMS & Phone Number Integration and paste your Telnyx Voice API Application ID.',
      },
      { status: 422 },
    )
  }

  try {
    // Step 1 — create a per-session telephony credential.
    const credRes = await fetch('https://api.telnyx.com/v2/telephony_credentials', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connection_id: connectionId,
        // Tag with the user's id so we can audit which agent registered.
        tag: ((session as any)?.user?.id as string | undefined) ?? 'unknown',
      }),
    })
    if (!credRes.ok) {
      const txt = await credRes.text().catch(() => '')
      return NextResponse.json(
        { error: `Telnyx credential creation failed (${credRes.status}): ${txt.slice(0, 240)}` },
        { status: 502 },
      )
    }
    const credJson = (await credRes.json()) as { data: { id: string; expires_at?: string } }
    const credId = credJson.data.id

    // Step 2 — exchange the credential for a WebRTC login token (JWT).
    const tokenRes = await fetch(
      `https://api.telnyx.com/v2/telephony_credentials/${encodeURIComponent(credId)}/token`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
      },
    )
    if (!tokenRes.ok) {
      const txt = await tokenRes.text().catch(() => '')
      return NextResponse.json(
        { error: `Telnyx token mint failed (${tokenRes.status}): ${txt.slice(0, 240)}` },
        { status: 502 },
      )
    }
    const loginToken = (await tokenRes.text()).trim()

    return NextResponse.json({
      provider: 'telnyx',
      loginToken,
      credentialId: credId,
      expiresAt: credJson.data.expires_at ?? null,
    })
  } catch (err) {
    console.error('[POST /api/calls/credentials]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to mint WebRTC credentials' },
      { status: 500 },
    )
  }
}
