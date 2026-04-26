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
      // Defensive: trim whitespace + sanity-check shape so we surface a
      // useful message when the saved value is empty or doesn't look like
      // a Telnyx V2 key (decryption returned garbage, copy/paste error, etc).
      const apiKey = (config.apiKey ?? '').trim()
      if (!apiKey) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Telnyx API key is empty after decrypt. Clear the API Key field, paste a fresh V2 key from Mission Control → API Keys, and Save.',
          },
          { status: 400 },
        )
      }
      if (!/^KEY[0-9A-Za-z_-]{20,}$/.test(apiKey)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Saved API key doesn't match the Telnyx V2 format (KEY…). Clear the field, paste again from Mission Control → API Keys, and Save.",
          },
          { status: 400 },
        )
      }

      // /v2/profile doesn't exist on Telnyx (404). /v2/phone_numbers
      // with page[size]=1 is a cheap auth-check.
      const res = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=1', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) {
        if (res.status === 401) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Telnyx rejected the API key (401). Steps to fix: (1) Mission Control → API Keys, (2) verify the key is active and on the same account as your phone numbers, (3) clear the API Key field in this form, paste again, and Save.",
            },
            { status: 400 },
          )
        }
        const txt = await res.text().catch(() => '')
        return NextResponse.json(
          { ok: false, error: `Telnyx returned ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ''}` },
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
