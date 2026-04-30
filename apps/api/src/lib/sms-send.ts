import { CommProviderConfig } from '@crm/database'

/**
 * Provider-agnostic outbound SMS dispatch for the api worker. Mirrors
 * `apps/web/src/lib/sms-send.ts` but reads the active CommProviderConfig
 * directly via Sequelize (the api process doesn't have access to the
 * Next.js cookie-aware helpers, and doesn't need them — the worker is
 * a single-tenant process).
 *
 * Returns the provider message id on success, throws on failure.
 */

export interface SendSmsArgs {
  from: string
  to: string
  text: string
}

export interface SendSmsResult {
  providerMessageId: string
  providerName: 'twilio' | 'telnyx' | 'signalhouse'
}

let cachedConfig: { row: any; loadedAt: number } | null = null
const CACHE_TTL_MS = 60_000

async function loadActiveConfig(): Promise<any | null> {
  if (cachedConfig && Date.now() - cachedConfig.loadedAt < CACHE_TTL_MS) {
    return cachedConfig.row
  }
  const row = await CommProviderConfig.findOne({
    where: { isActive: true } as any,
    raw: true,
  })
  cachedConfig = { row, loadedAt: Date.now() }
  return row
}

export async function sendSms({ from, to, text }: SendSmsArgs): Promise<SendSmsResult> {
  if (!from || !to) {
    throw new Error('Both `from` and `to` are required to send an SMS.')
  }

  const config = await loadActiveConfig()
  if (!config) {
    throw new Error('No active SMS provider configured.')
  }

  if (config.providerName === 'telnyx') {
    return sendTelnyx({
      apiKey: config.apiKey,
      messagingProfileId: config.messagingProfileId,
      from,
      to,
      text,
    })
  }

  // Twilio path — fall back to env-configured Twilio account so the
  // legacy automation-runner / drip-executor send path keeps working.
  return sendTwilioViaEnv({ from, to, text })
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
    throw new Error('Telnyx API Key is missing in CommProviderConfig.')
  }
  const payload: Record<string, unknown> = { from, to, text }
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
      const j = await res.json()
      const first = Array.isArray(j?.errors) ? j.errors[0] : null
      detail = first?.detail || first?.title || JSON.stringify(j)
    } catch {
      detail = (await res.text().catch(() => '')) || `HTTP ${res.status}`
    }
    throw new Error(`Telnyx send failed (${res.status}): ${detail}`)
  }
  const json = (await res.json()) as { data?: { id?: string } }
  const id = json?.data?.id
  if (!id) throw new Error('Telnyx response missing data.id')
  return { providerMessageId: id, providerName: 'telnyx' }
}

async function sendTwilioViaEnv({
  from,
  to,
  text,
}: SendSmsArgs): Promise<SendSmsResult> {
  // Lazy import — twilio is optional, only used by older code paths.
  const { default: twilio } = await import('twilio')
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) {
    console.log(`[sms-send] MOCK Twilio → ${to}: "${text.slice(0, 60)}..."`)
    return { providerMessageId: 'mock-sms-sid', providerName: 'twilio' }
  }
  const client = twilio(sid, token)
  const message = await client.messages.create({ to, from, body: text })
  return { providerMessageId: message.sid, providerName: 'twilio' }
}
