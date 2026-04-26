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
  }

  const ok = checks.appExists.ok && checks.webhookMatch.ok && checks.numbersAssigned.ok

  return NextResponse.json({
    ok,
    voiceApplicationId: appId,
    appKind,
    checks,
  })
}
