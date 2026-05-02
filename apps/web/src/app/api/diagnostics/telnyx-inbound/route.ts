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

  // 3) List the user's phone numbers and check connection_id.
  //
  // A Telnyx phone number's `connection_id` can point to ONE thing:
  // either a Voice API Application (inbound webhooks fire to our
  // configured URL) or a SIP Connection of Credentials type (browser
  // WebRTC outbound + inbound rings the registered SIP user). The two
  // are mutually exclusive — you pick a routing path per number.
  //
  // Our config holds both IDs so we can support both paths. The check
  // accepts either as a valid assignment and reports which path the
  // number is on so the operator knows what's enabled for that number.
  const sipConnectionId = config.voiceConnectionId ?? null
  let numbersChecked: Array<{
    number: string
    assigned: boolean
    connectionId: string | null
    /** Which side the number is routing through. */
    routedVia: 'voice-app' | 'sip-connection' | 'other' | 'none'
  }> = []
  let numbersFetchError: string | null = null
  try {
    const numRes = await fetch(
      'https://api.telnyx.com/v2/phone_numbers?page[size]=100',
      { headers: { Authorization: `Bearer ${config.apiKey}` } },
    )
    if (numRes.ok) {
      const numJson = (await numRes.json().catch(() => ({}))) as any
      const numbers = (numJson?.data ?? []) as Array<any>
      numbersChecked = numbers.map((n) => {
        const cid = n.connection_id ?? null
        let routedVia: 'voice-app' | 'sip-connection' | 'other' | 'none' = 'none'
        if (cid === appId) routedVia = 'voice-app'
        else if (sipConnectionId && cid === sipConnectionId) routedVia = 'sip-connection'
        else if (cid) routedVia = 'other'
        return {
          number: n.phone_number,
          connectionId: cid,
          assigned: routedVia === 'voice-app' || routedVia === 'sip-connection',
          routedVia,
        }
      })
    } else {
      numbersFetchError = `Telnyx returned ${numRes.status} listing phone numbers.`
    }
  } catch (err) {
    numbersFetchError = err instanceof Error ? err.message : 'Failed to list phone numbers.'
  }

  const assignedCount = numbersChecked.filter((n) => n.assigned).length
  const sipAssignedCount = numbersChecked.filter((n) => n.routedVia === 'sip-connection').length
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

      // Read the body so we can detect ngrok-offline / tunnel-not-found
      // responses, which return HTTP 404 with a recognisable error code
      // header/body. Without this check, a dead tunnel green-checks as
      // "reachable" because we got *some* HTTP response back.
      const ngrokError = probeRes.headers.get('ngrok-error-code')
      let bodyText = ''
      try {
        bodyText = await probeRes.text()
      } catch {
        /* ignore — body read may fail on streaming responses */
      }
      const isNgrokOffline =
        ngrokError === 'ERR_NGROK_3200' ||
        bodyText.includes('ERR_NGROK_3200') ||
        bodyText.includes('endpoint is offline')
      const isNgrokError =
        !!ngrokError ||
        (status === 404 && (bodyText.includes('ngrok-free') || bodyText.includes('ngrok.com')))

      // 401/403 = webhook URL is reachable + signature check is gating
      //          (expected behavior when Public Key is set)
      // 200    = webhook URL is reachable + handler accepted (Public
      //          Key not set, or the body had no event_type so was
      //          ignored — also fine)
      // 404    = route does NOT exist — handler not registered. Most
      //          common cause is ngrok tunnel offline (recognised
      //          above) or a deployed app missing the webhook route.
      // 5xx    = handler crashed
      // network error = URL not reachable from the public internet
      const rejectedBySig = status === 401 || status === 403
      const handlerAccepted = status === 200 || rejectedBySig
      const ok = handlerAccepted && !isNgrokError

      reachCheck = {
        ok,
        status,
        message: isNgrokOffline
          ? `ngrok tunnel is OFFLINE (${ngrokError ?? 'ERR_NGROK_3200'}). Telnyx webhooks return HTTP 404 and are discarded — this is why inbound calls/SMS aren't reaching the CRM. Restart ngrok and update the webhook URLs in Telnyx if the URL changed.`
          : isNgrokError
            ? `ngrok returned HTTP ${status}${ngrokError ? ` (${ngrokError})` : ''}. The tunnel is misconfigured. Check that ngrok is running and forwarding to the correct local port.`
            : rejectedBySig
              ? `Reachable (HTTP ${status}) — signature verification rejected the probe, which is expected. The route is live and Telnyx's signed webhooks will pass.`
              : status === 404
                ? `Reachable but returned HTTP 404 — the webhook route is not registered at this path. Verify the URL is exactly ${expectedWebhook} and that the dev server is running.`
                : status === 200
                  ? `Reachable (HTTP 200). Handler accepted the probe.`
                  : status >= 500
                    ? `Reachable but the handler returned HTTP ${status}. Check the dev server console for stack traces.`
                    : `Reachable (HTTP ${status}) — unexpected response from the handler.`,
      }
    } catch (err: any) {
      const msg = err?.name === 'AbortError'
        ? `Timed out reaching ${expectedWebhook} (>8s). The tunnel may be unreachable from this server.`
        : err?.message ?? 'Network error reaching the webhook URL.'
      reachCheck = { ok: false, status: null, message: msg }
    }
  }

  // 5b) SIP Connection webhook check.
  //
  //     When numbers are routed via a SIP Connection (the browser-call
  //     path), inbound webhooks fire to the SIP Connection's OWN
  //     webhook_event_url — separate from the Voice API App's URL.
  //     If this is empty, Telnyx still rings the browser softphone
  //     correctly, but the CRM never sees `call.initiated` events and
  //     can't auto-create leads.
  type SipConnectionCheck = {
    ok: boolean
    message: string
    webhookUrl?: string | null
    connectionName?: string | null
  }
  let sipConnectionCheck: SipConnectionCheck | null = null
  if (config.voiceConnectionId && sipAssignedCount > 0) {
    try {
      const sipRes = await fetch(
        `https://api.telnyx.com/v2/credential_connections/${encodeURIComponent(config.voiceConnectionId)}`,
        { headers: { Authorization: `Bearer ${config.apiKey}` } },
      )
      if (sipRes.ok) {
        const sipJson = (await sipRes.json().catch(() => null)) as any
        const sip = sipJson?.data
        // Telnyx exposes the field as webhook_event_url on credential
        // connections; older SDKs may show it as webhook_url. Accept both.
        const sipWebhook = (sip?.webhook_event_url ?? sip?.webhook_url ?? '').trim()
        const sipName = sip?.connection_name ?? sip?.user_name ?? null
        const sipMatches =
          expectedWebhook && sipWebhook
            ? sipWebhook.replace(/\/$/, '') === expectedWebhook.replace(/\/$/, '')
            : null
        if (!sipWebhook) {
          sipConnectionCheck = {
            ok: false,
            webhookUrl: null,
            connectionName: sipName,
            message: `SIP Connection "${sipName ?? config.voiceConnectionId}" has NO webhook URL set. ${sipAssignedCount} number(s) routed via this connection will NOT fire inbound webhooks — calls will ring the browser softphone but the CRM won't see them. Set it in Telnyx Mission Control → Voice → SIP Connections → ${sipName ?? 'your connection'} → Webhook URL.`,
          }
        } else if (sipMatches === false) {
          sipConnectionCheck = {
            ok: false,
            webhookUrl: sipWebhook,
            connectionName: sipName,
            message: `SIP Connection webhook is "${sipWebhook}", but the CRM expects "${expectedWebhook}". Update it in Telnyx Mission Control.`,
          }
        } else {
          sipConnectionCheck = {
            ok: true,
            webhookUrl: sipWebhook,
            connectionName: sipName,
            message: `SIP Connection "${sipName ?? config.voiceConnectionId}" webhook URL: ${sipWebhook}`,
          }
        }
      } else {
        sipConnectionCheck = {
          ok: false,
          message: `Could not fetch SIP Connection ${config.voiceConnectionId} from Telnyx (HTTP ${sipRes.status}).`,
        }
      }
    } catch (err) {
      sipConnectionCheck = {
        ok: false,
        message: err instanceof Error ? `SIP Connection lookup failed: ${err.message}` : 'SIP Connection lookup failed.',
      }
    }
  }

  // 6) Signature key configured? If Public Key is missing, signed
  //    webhooks will pass (we skip verification in dev), but the
  //    operator should set it before going to production.
  const sigCheck = config.publicKey
    ? { ok: true, message: 'Public Key is set — inbound webhooks will be ed25519-verified.' }
    : { ok: true, message: 'Public Key is not set — webhooks will be accepted without verification (dev mode).' }

  // 7) Recent Telnyx-side activity. If the operator just sent a test
  //    SMS but the CRM has nothing, we can directly ask Telnyx whether
  //    the message arrived at THEIR side. If Telnyx has it but the CRM
  //    doesn't, the failure is webhook delivery (signature, network,
  //    timeout). If Telnyx doesn't have it either, the failure is
  //    upstream (carrier, wrong number, account suspended).
  let recentActivity: {
    ok: boolean
    message: string
    messages: Array<{ direction: string; from: string; to: string; text: string; receivedAt: string | null }>
  } = {
    ok: true,
    message: 'No recent inbound messages on this Telnyx account in the last 24h.',
    messages: [],
  }
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const mdrRes = await fetch(
      `https://api.telnyx.com/v2/detail_records?filter[record_type]=mdr&filter[direction]=inbound&filter[date_range][gte]=${encodeURIComponent(since)}&page[size]=10`,
      { headers: { Authorization: `Bearer ${config.apiKey}` } },
    )
    if (mdrRes.ok) {
      const mdrJson = (await mdrRes.json().catch(() => ({}))) as any
      const records = (mdrJson?.data ?? []) as Array<any>
      const messages = records.map((r) => ({
        direction: r.direction ?? 'inbound',
        from: r.source ?? r.from ?? '—',
        to: r.destination ?? r.to ?? '—',
        text: (r.message_body ?? r.text ?? '').slice(0, 80),
        receivedAt: r.created_at ?? r.completed_at ?? null,
      }))
      if (messages.length > 0) {
        recentActivity = {
          ok: true,
          message: `Telnyx has ${messages.length} inbound message${messages.length === 1 ? '' : 's'} on this account in the last 24h. If they're missing from the CRM, the webhook isn't being delivered (or signature verification is rejecting them silently).`,
          messages,
        }
      }
    } else if (mdrRes.status === 404) {
      // Detail records endpoint not available on free tier — fall
      // back to a softer message without failing the whole diagnostic.
      recentActivity = {
        ok: true,
        message: 'Telnyx Detail Records aren\'t available on this account tier — can\'t cross-check inbound activity. Use the Recent Webhook Hits panel below instead.',
        messages: [],
      }
    } else {
      recentActivity = {
        ok: true,
        message: `Could not fetch recent activity from Telnyx (HTTP ${mdrRes.status}).`,
        messages: [],
      }
    }
  } catch (err) {
    recentActivity = {
      ok: true,
      message: err instanceof Error ? `Recent activity check failed: ${err.message}` : 'Recent activity check failed.',
      messages: [],
    }
  }

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
              'No phone numbers found on this Telnyx account. Buy or port a number in Mission Control → Numbers, then assign it to either your Voice API App or your SIP Connection.',
            numbers: numbersChecked,
          }
        : assignedCount === 0
          ? {
              ok: false,
              message: `${totalCount} number${totalCount === 1 ? '' : 's'} on this account, but NONE are assigned to your Voice API App OR your SIP Connection. A number's connection_id can point to one of those — set it in Mission Control → Numbers → My Numbers → Connection.`,
              numbers: numbersChecked,
            }
          : {
              ok: true,
              message:
                sipAssignedCount > 0 && sipAssignedCount === assignedCount
                  ? `${assignedCount} of ${totalCount} number${totalCount === 1 ? '' : 's'} assigned via the SIP Connection (browser-call path). Inbound webhooks fire if the SIP Connection has its own webhook URL configured.`
                  : sipAssignedCount > 0
                    ? `${assignedCount} of ${totalCount} number${totalCount === 1 ? '' : 's'} assigned (mix of Voice App + SIP Connection paths).`
                    : `${assignedCount} of ${totalCount} number${totalCount === 1 ? '' : 's'} assigned via the Voice API App (inbound webhook path).`,
              numbers: numbersChecked,
            },
    ...(sipConnectionCheck ? { sipConnection: sipConnectionCheck } : {}),
    messagingProfile: mpCheck,
    reachability: reachCheck,
    signatureKey: sigCheck,
    recentActivity,
  }

  const ok =
    checks.appExists.ok &&
    checks.webhookMatch.ok &&
    checks.numbersAssigned.ok &&
    (sipConnectionCheck ? sipConnectionCheck.ok : true) &&
    checks.messagingProfile.ok &&
    checks.reachability.ok

  return NextResponse.json({
    ok,
    voiceApplicationId: appId,
    appKind,
    checks,
  })
}
