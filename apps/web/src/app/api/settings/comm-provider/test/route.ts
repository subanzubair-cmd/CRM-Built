import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { getActiveCommConfig } from '@/lib/comm-provider'

/**
 * POST /api/settings/comm-provider/test
 * Performs a minimal auth check against the active provider to verify creds.
 */
export async function POST() {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const config = await getActiveCommConfig()
  if (!config) {
    return NextResponse.json({ ok: false, error: 'No active provider configured' }, { status: 400 })
  }

  try {
    if (config.providerName === 'twilio') {
      if (!config.accountSid || !config.authToken) {
        return NextResponse.json({ ok: false, error: 'Twilio credentials incomplete' }, { status: 400 })
      }
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}.json`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
          },
        },
      )
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: `Twilio auth failed (${res.status})` }, { status: 400 })
      }
      const data = await res.json()
      return NextResponse.json({ ok: true, provider: 'twilio', accountFriendlyName: data.friendly_name })
    }

    if (config.providerName === 'telnyx') {
      if (!config.apiKey) {
        return NextResponse.json({ ok: false, error: 'Telnyx API key missing' }, { status: 400 })
      }
      // /v2/profile doesn't exist on Telnyx (404). /v2/phone_numbers
      // with page[size]=1 is a cheap auth-check that exercises the same
      // permissions the CRM actually needs.
      const res = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=1', {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        return NextResponse.json(
          { ok: false, error: `Telnyx auth failed (${res.status})${txt ? `: ${txt.slice(0, 160)}` : ''}` },
          { status: 400 },
        )
      }
      const data = await res.json().catch(() => ({}))
      const numberCount = (data?.meta?.total_results as number | undefined) ?? null
      return NextResponse.json({
        ok: true,
        provider: 'telnyx',
        accountFriendlyName:
          numberCount !== null ? `${numberCount} number${numberCount === 1 ? '' : 's'} on this account` : 'authenticated',
      })
    }

    if (config.providerName === 'signalhouse') {
      if (!config.apiToken) {
        return NextResponse.json({ ok: false, error: 'Signal House API token missing' }, { status: 400 })
      }
      // Signal House / SignalWire: namespaced API base requires accountId
      // Minimal check — just verify we have creds (no public ping endpoint without account context)
      return NextResponse.json({ ok: true, provider: 'signalhouse', note: 'Credentials present; full validation on first send' })
    }

    return NextResponse.json({ ok: false, error: 'Unknown provider' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Test failed' }, { status: 500 })
  }
}
