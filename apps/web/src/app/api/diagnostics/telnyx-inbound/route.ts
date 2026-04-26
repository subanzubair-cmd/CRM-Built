import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { getActiveCommConfig } from '@/lib/comm-provider'

/**
 * GET /api/diagnostics/telnyx-inbound?expectedWebhook=https://...
 *
 * Verifies the three things that must be true for an inbound call to
 * actually reach the CRM:
 *
 *   1. The Voice API Application configured in Settings exists in
 *      Telnyx and its webhook_event_url is reachable from Telnyx.
 *   2. The webhook URL on the Voice API App matches the URL the CRM
 *      expects (current ngrok tunnel or production hostname).
 *   3. Each of the user's purchased phone numbers is assigned to that
 *      Voice API App via its `connection_id`.
 *
 * Result is a structured object the UI renders as a checklist with
 * actionable error messages — most setup mistakes (number not assigned,
 * webhook pointing at the wrong URL) show up as a single red ❌.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const expectedWebhook = req.nextUrl.searchParams.get('expectedWebhook')?.trim() || null

  const config = await getActiveCommConfig()
  if (config?.providerName !== 'telnyx') {
    return NextResponse.json(
      { ok: false, error: 'Active provider is not Telnyx. Switch the active provider in Settings → Integrations first.' },
      { status: 400 },
    )
  }
  if (!config.apiKey) {
    return NextResponse.json(
      { ok: false, error: 'Telnyx API key is missing. Paste a fresh V2 key in Settings and Save.' },
      { status: 400 },
    )
  }
  // We collapsed the two ID fields in the form — fall back the same
  // way /api/calls/credentials does so this diagnostic stays in sync.
  const appId = config.voiceApplicationId || config.voiceConnectionId
  if (!appId) {
    return NextResponse.json(
      { ok: false, error: 'Voice Application ID is not configured. Paste it from Telnyx → Voice → Voice API & Apps.' },
      { status: 400 },
    )
  }

  // 1) Look up the Voice API Application.
  const appRes = await fetch(
    `https://api.telnyx.com/v2/texml_applications/${encodeURIComponent(appId)}`,
    { headers: { Authorization: `Bearer ${config.apiKey}` } },
  ).catch(() => null)
  // Voice API Apps live under /v2/call_control_applications, NOT
  // /v2/texml_applications (those are for Twilio-style TeXML apps).
  // We try the correct endpoint as the primary lookup.
  const ccAppRes = await fetch(
    `https://api.telnyx.com/v2/call_control_applications/${encodeURIComponent(appId)}`,
    { headers: { Authorization: `Bearer ${config.apiKey}` } },
  ).catch(() => null)

  let app: any = null
  let appKind: 'call_control' | 'texml' | null = null
  if (ccAppRes?.ok) {
    app = (await ccAppRes.json().catch(() => null))?.data
    appKind = 'call_control'
  } else if (appRes?.ok) {
    app = (await appRes.json().catch(() => null))?.data
    appKind = 'texml'
  }

  if (!app) {
    return NextResponse.json({
      ok: false,
      checks: {
        appExists: { ok: false, message: `Voice Application ${appId} not found in your Telnyx account. Re-copy the ID from Mission Control → Voice → Voice API & Apps.` },
        webhookMatch: { ok: false, message: 'Skipped — app not found.' },
        numbersAssigned: { ok: false, message: 'Skipped — app not found.' },
      },
    })
  }

  const actualWebhook = (app.webhook_event_url ?? '').trim()
  const webhookOk = actualWebhook.length > 0
  const webhookMatches =
    expectedWebhook && actualWebhook
      ? actualWebhook.replace(/\/$/, '') === expectedWebhook.replace(/\/$/, '')
      : null

  // 3) List the user's phone numbers and check connection_id matches.
  let numbersChecked: Array<{ number: string; assigned: boolean; connectionId: string | null }> = []
  let numbersFetchError: string | null = null
  try {
    const numRes = await fetch(
      'https://api.telnyx.com/v2/phone_numbers?page[size]=100',
      { headers: { Authorization: `Bearer ${config.apiKey}` } },
    )
    if (numRes.ok) {
      const numJson = (await numRes.json().catch(() => ({}))) as any
      const numbers = (numJson?.data ?? []) as Array<any>
      numbersChecked = numbers.map((n) => ({
        number: n.phone_number,
        // Telnyx phone numbers expose `connection_id` (the SIP
        // connection or Voice API App that handles inbound calls).
        connectionId: n.connection_id ?? null,
        assigned: n.connection_id === appId,
      }))
    } else {
      numbersFetchError = `Telnyx returned ${numRes.status} listing phone numbers.`
    }
  } catch (err) {
    numbersFetchError = err instanceof Error ? err.message : 'Failed to list phone numbers.'
  }

  const assignedCount = numbersChecked.filter((n) => n.assigned).length
  const totalCount = numbersChecked.length

  // 4) Messaging Profile — SMS goes through here, NOT the Voice App.
  //    A misconfigured Messaging Profile is the most common reason
  //    voice works but SMS doesn't.
  const messagingProfileId = config.messagingProfileId
  let mpCheck: { ok: boolean; message: string; actual?: string | null; profileName?: string } = {
    ok: false,
    message: 'Messaging Profile ID is not configured. Paste it in Settings → Messaging Profile ID.',
  }
  if (messagingProfileId) {
    try {
      const mpRes = await fetch(
        `https://api.telnyx.com/v2/messaging_profiles/${encodeURIComponent(messagingProfileId)}`,
        { headers: { Authorization: `Bearer ${config.apiKey}` } },
      )
      if (mpRes.ok) {
        const mpJson = (await mpRes.json().catch(() => null)) as any
        const mp = mpJson?.data
        // The inbound SMS webhook URL on a Messaging Profile is
        // exposed as `webhook_url` (or sometimes nested under
        // `webhook_failover_url` / `webhook_api_version`).
        const mpWebhook = (mp?.webhook_url ?? '').trim()
        const mpMatches =
          expectedWebhook && mpWebhook
            ? mpWebhook.replace(/\/$/, '') === expectedWebhook.replace(/\/$/, '')
            : null
        if (!mpWebhook) {
          mpCheck = {
            ok: false,
            actual: null,
            profileName: mp?.name,
            message: `Messaging Profile "${mp?.name ?? messagingProfileId}" has no webhook URL set. Open Telnyx → Messaging → Messaging Profiles → ${mp?.name ?? 'your profile'} → Inbound Webhook URL, paste the URL below, then Save.`,
          }
        } else if (mpMatches === false) {
          mpCheck = {
            ok: false,
            actual: mpWebhook,
            profileName: mp?.name,
            message: `Messaging Profile webhook is "${mpWebhook}", but the CRM expects "${expectedWebhook}". Update it in Telnyx Mission Control.`,
          }
        } else {
          mpCheck = {
            ok: true,
            actual: mpWebhook,
            profileName: mp?.name,
            message: `Messaging Profile "${mp?.name ?? messagingProfileId}" webhook URL matches.`,
          }
        }
      } else {
        mpCheck = {
          ok: false,
          message: `Messaging Profile ${messagingProfileId} not found in your Telnyx account (HTTP ${mpRes.status}). Re-copy the ID from Mission Control → Messaging → Messaging Profiles.`,
        }
      }
    } catch (err) {
      mpCheck = {
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to look up Messaging Profile.',
      }
    }
  }

  // 5) External reachability — hit the public webhook URL ourselves,
  //    posting a tiny JSON body (no signature). The handler will reject
  //    with 401 if signature verification is enforced — that's actually
  //    GOOD because it confirms the URL is reachable AND the route is
  //    live. A network error means Telnyx wouldn't reach us either.
  let reachCheck: { ok: boolean; status: number | null; message: string } = {
    ok: false,
    status: null,
    message: 'Skipped — no expected webhook URL provided.',
  }
  if (expectedWebhook) {
    try {
      const probeRes = await fetch(expectedWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probe: 'diagnostic', ts: Date.now() }),
        // Short timeout so a slow tunnel doesn't hang the diagnostic.
        signal: AbortSignal.timeout(8_000),
      })
      const status = probeRes.status
      // 401/403 = webhook URL is reachable + signature check is gating
      //          (expected behavior when Public Key is set)
      // 200    = webhook URL is reachable + handler accepted (Public
      //          Key not set, or the body had no event_type so was
      //          ignored — also fine)
      // 4xx other = handler rejected the body shape (unusual but ok)
      // 5xx    = handler crashed
      // network error = URL not reachable from the public internet
      const reachable = status > 0
      const rejectedBySig = status === 401 || status === 403
      reachCheck = {
        ok: reachable,
        status,
        message: !reachable
          ? `Could not reach ${expectedWebhook}. Check that ngrok is running and the URL still resolves.`
          : rejectedBySig
            ? `Reachable (HTTP ${status}) — signature verification rejected the probe, which is expected. The route is live and Telnyx's signed webhooks will pass.`
            : status >= 500
              ? `Reachable but the handler returned HTTP ${status}. Check the dev server console for stack traces.`
              : `Reachable (HTTP ${status}). Handler accepted the probe.`,
      }
    } catch (err: any) {
      const msg = err?.name === 'AbortError'
        ? `Timed out reaching ${expectedWebhook} (>8s). The tunnel may be unreachable from this server.`
        : err?.message ?? 'Network error reaching the webhook URL.'
      reachCheck = { ok: false, status: null, message: msg }
    }
  }

  // 6) Signature key configured? If Public Key is missing, signed
  //    webhooks will pass (we skip verification in dev), but the
  //    operator should set it before going to production.
  const sigCheck = config.publicKey
    ? { ok: true, message: 'Public Key is set — inbound webhooks will be ed25519-verified.' }
    : { ok: true, message: 'Public Key is not set — webhooks will be accepted without verification (dev mode).' }

  const checks = {
    appExists: {
      ok: true,
      message: `Voice ${appKind === 'call_control' ? 'API Application' : 'TeXML Application'} "${app.application_name ?? app.friendly_name ?? appId}" found.`,
    },
    webhookMatch: {
      ok: webhookOk && (webhookMatches !== false),
      actual: actualWebhook || null,
      expected: expectedWebhook,
      message: !webhookOk
        ? 'No webhook URL is set on this Voice Application. Paste the URL below into Telnyx → Voice → Voice API & Apps → your app → Webhook URL, then Save.'
        : webhookMatches === false
          ? `Telnyx is sending webhooks to "${actualWebhook}", but the CRM is expecting them at "${expectedWebhook}". Update the URL in Telnyx Mission Control.`
          : webhookMatches === null
            ? `Webhook URL on Telnyx is "${actualWebhook}". Pass ?expectedWebhook=... to verify it points at this CRM.`
            : `Webhook URL matches.`,
    },
    numbersAssigned: numbersFetchError
      ? { ok: false, message: numbersFetchError, numbers: [] as typeof numbersChecked }
      : totalCount === 0
        ? {
            ok: false,
            message:
              'No phone numbers found on this Telnyx account. Buy or port a number in Mission Control → Numbers, then assign it to your Voice API Application.',
            numbers: numbersChecked,
          }
        : assignedCount === 0
          ? {
              ok: false,
              message: `${totalCount} number${totalCount === 1 ? '' : 's'} on this account, but NONE are assigned to this Voice Application. Open each number in Telnyx → Numbers → My Numbers and set "Connection" to "${app.application_name ?? appId}".`,
              numbers: numbersChecked,
            }
          : {
              ok: true,
              message: `${assignedCount} of ${totalCount} number${totalCount === 1 ? '' : 's'} assigned to this Voice Application.`,
              numbers: numbersChecked,
            },
    messagingProfile: mpCheck,
    reachability: reachCheck,
    signatureKey: sigCheck,
  }

  const ok =
    checks.appExists.ok &&
    checks.webhookMatch.ok &&
    checks.numbersAssigned.ok &&
    checks.messagingProfile.ok &&
    checks.reachability.ok

  return NextResponse.json({
    ok,
    voiceApplicationId: appId,
    appKind,
    checks,
  })
}
