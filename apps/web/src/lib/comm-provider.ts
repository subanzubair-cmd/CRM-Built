import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'

export type CommProvider = 'twilio' | 'telnyx' | 'signalhouse'

export interface ActiveCommConfig {
  providerName: CommProvider
  defaultNumber: string | null
  // Twilio
  accountSid?: string
  authToken?: string
  twimlHost?: string
  // Telnyx
  apiKey?: string
  messagingProfileId?: string
  publicKey?: string
  // Signal House
  apiToken?: string
  accountId?: string
}

const CACHE_TTL_MS = 30_000
let cached: { config: ActiveCommConfig | null; fetchedAt: number } | null = null

/**
 * Bust the in-memory cache so the next call fetches from DB.
 * Called by the PUT /api/settings/comm-provider handler.
 */
export function refreshCommConfig() {
  cached = null
}

/**
 * Resolve the currently-active provider config. Falls back to env vars as Twilio
 * config if no active DB row (keeps backward-compat during migration).
 */
export async function getActiveCommConfig(): Promise<ActiveCommConfig | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.config
  }

  let config: ActiveCommConfig | null = null

  try {
    const row = await (prisma as any).commProviderConfig.findFirst({
      where: { isActive: true },
    })

    if (row) {
      const cfg = (row.configJson ?? {}) as Record<string, string | undefined>
      const providerName = row.providerName as CommProvider
      config = {
        providerName,
        defaultNumber: row.defaultNumber ?? null,
      }

      if (providerName === 'twilio') {
        config.accountSid = cfg.accountSid
        config.authToken = cfg.authToken ? decrypt(cfg.authToken) : undefined
        config.twimlHost = cfg.twimlHost
      } else if (providerName === 'telnyx') {
        config.apiKey = cfg.apiKey ? decrypt(cfg.apiKey) : undefined
        config.messagingProfileId = cfg.messagingProfileId
        config.publicKey = cfg.publicKey
      } else if (providerName === 'signalhouse') {
        config.apiToken = cfg.apiToken ? decrypt(cfg.apiToken) : undefined
        config.accountId = cfg.accountId
      }
    }
  } catch (err) {
    console.error('[comm-provider] DB lookup failed, falling back to env:', err)
  }

  // Fallback to env vars (Twilio-only) if nothing active in DB
  if (!config || (config.providerName === 'twilio' && !config.accountSid)) {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      config = {
        providerName: 'twilio',
        defaultNumber: process.env.TWILIO_DEFAULT_NUMBER ?? null,
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        twimlHost: process.env.TWILIO_TWIML_HOST ?? 'http://localhost:3000',
      }
    }
  }

  cached = { config, fetchedAt: Date.now() }
  return config
}
