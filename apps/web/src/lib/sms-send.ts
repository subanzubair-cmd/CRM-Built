import { getActiveCommConfig } from '@/lib/comm-provider'

/**
 * sendSms — provider-agnostic outbound SMS dispatch.
 *
 * Returns the provider's message id on success, throws on failure. The
 * caller (e.g. /api/messages) is responsible for translating the error
 * into an HTTP response and for persisting the Message row.
 *
 * Today only Telnyx is wired here. Twilio and Signal House live
 * separately in the existing /api/sms paths (if any) — we'll fold them
 * in once we have a unified send signature across providers.
 */

export interface SendSmsArgs {
  /** E.164-ish phone of the agent / CRM number sending. */
  from: string
  /** E.164-ish phone of the recipient. */
  to: string
  /** Plain-text body. */
  text: string
}

export interface SendSmsResult {
  /** Provider message id (Telnyx returns a UUID). */
  providerMessageId: string
  providerName: 'twilio' | 'telnyx' | 'signalhouse'
}

export async function sendSms({ from, to, text }: SendSmsArgs): Promise<SendSmsResult> {
  const config = await getActiveCommConfig()
  if (!config) {
    throw new Error(
      'No active SMS provider configured. Set one up in Settings → SMS & Phone Number Integration.',
    )
  }

  if (!from || !to) {
    throw new Error('Both `from` and `to` are required to send an SMS.')
  }

  if (config.providerName === 'telnyx') {
    return sendTelnyx({ apiKey: config.apiKey, messagingProfileId: config.messagingProfileId, from, to, text })
  }

  // Twilio / Signal House outbound senders aren't wired in this
  // helper yet. Leaving an explicit error so callers know exactly
  // why a non-Telnyx send didn't go out, rather than silently
  // logging the message into the DB.
  throw new Error(
    `Outbound SMS for provider "${config.providerName}" is not implemented in this CRM build yet. Switch to Telnyx in Settings or contact engineering.`,
  )
}

async function sendTelnyx({
  apiKey,
  messagingProfileId,
  from,
  to,
  text,
}: {
  apiKey: string | undefined
  messagingProfileId: string | undefined
  from: string
  to: string
  text: string
}): Promise<SendSmsResult> {
  if (!apiKey) {
    throw new Error('Telnyx API Key is missing. Set it in Settings → SMS & Phone Number Integration.')
  }
  // messaging_profile_id helps Telnyx pick the right 10DLC campaign
  // and is REQUIRED if `from` isn't already attached to a profile —
  // we always pass it when present.
  const payload: Record<string, unknown> = {
    from,
    to,
    text,
  }
  if (messagingProfileId) payload.messaging_profile_id = messagingProfileId

  const res = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    let detail = ''
    try {
      const json = await res.json()
      // Telnyx returns { errors: [{ title, detail, ... }] }
      const first = Array.isArray(json?.errors) ? json.errors[0] : null
      detail = first?.detail || first?.title || JSON.stringify(json)
    } catch {
      detail = (await res.text().catch(() => '')) || `HTTP ${res.status}`
    }
    throw new Error(`Telnyx send failed (${res.status}): ${detail}`)
  }

  const json = (await res.json()) as { data?: { id?: string } }
  const providerMessageId = json?.data?.id
  if (!providerMessageId) {
    throw new Error('Telnyx response missing data.id')
  }
  return { providerMessageId, providerName: 'telnyx' }
}
