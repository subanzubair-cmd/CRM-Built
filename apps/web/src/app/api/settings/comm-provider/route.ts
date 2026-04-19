import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'
import { encrypt, maskSecret, maskId } from '@/lib/crypto'
import { refreshCommConfig, type CommProvider } from '@/lib/comm-provider'
import { rateLimitMutation } from '@/lib/rate-limit'

const MASK_PLACEHOLDER = '••••••••'
const PROVIDERS: CommProvider[] = ['twilio', 'telnyx', 'signalhouse']

const AVAILABLE_PROVIDERS = [
  { name: 'twilio', label: 'Twilio' },
  { name: 'telnyx', label: 'Telnyx' },
  { name: 'signalhouse', label: 'Signal House' },
]

/**
 * GET /api/settings/comm-provider
 * Returns all provider configs with secrets masked.
 */
export async function GET() {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  // Ensure all three rows exist (idempotent upsert)
  for (const name of PROVIDERS) {
    await (prisma as any).commProviderConfig.upsert({
      where: { providerName: name },
      create: { providerName: name, isActive: false },
      update: {},
    })
  }

  const rows = await (prisma as any).commProviderConfig.findMany()

  const providers = rows.map((row: any) => {
    const cfg = (row.configJson ?? {}) as Record<string, string | undefined>
    const name = row.providerName as CommProvider
    const masked: Record<string, string> = {}

    if (name === 'twilio') {
      masked.accountSid = maskId(cfg.accountSid)
      masked.authToken = maskSecret(cfg.authToken)
      masked.twimlHost = cfg.twimlHost ?? ''
    } else if (name === 'telnyx') {
      masked.apiKey = maskSecret(cfg.apiKey)
      masked.messagingProfileId = cfg.messagingProfileId ?? ''
      masked.publicKey = cfg.publicKey ?? ''
    } else if (name === 'signalhouse') {
      masked.apiToken = maskSecret(cfg.apiToken)
      masked.accountId = cfg.accountId ?? ''
    }

    return {
      providerName: row.providerName,
      isActive: row.isActive,
      defaultNumber: row.defaultNumber ?? '',
      config: masked,
    }
  })

  return NextResponse.json({
    availableProviders: AVAILABLE_PROVIDERS,
    providers,
  })
}

const TwilioCfg = z.object({
  accountSid: z.string().optional(),
  authToken: z.string().optional(),
  twimlHost: z.string().optional(),
})
const TelnyxCfg = z.object({
  apiKey: z.string().optional(),
  messagingProfileId: z.string().optional(),
  publicKey: z.string().optional(),
})
const SignalHouseCfg = z.object({
  apiToken: z.string().optional(),
  accountId: z.string().optional(),
})

const PutBodySchema = z.discriminatedUnion('providerName', [
  z.object({ providerName: z.literal('twilio'), defaultNumber: z.string().optional(), config: TwilioCfg }),
  z.object({ providerName: z.literal('telnyx'), defaultNumber: z.string().optional(), config: TelnyxCfg }),
  z.object({ providerName: z.literal('signalhouse'), defaultNumber: z.string().optional(), config: SignalHouseCfg }),
])

/**
 * PUT /api/settings/comm-provider
 * Saves the provided provider config and marks it as active.
 */
export async function PUT(req: NextRequest) {
  const limited = rateLimitMutation(req, { bucket: 'settings.comm-provider', limit: 10 })
  if (limited) return limited
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const body = await req.json()
  const parsed = PutBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { providerName, defaultNumber } = parsed.data
  const newCfg = parsed.data.config as Record<string, string | undefined>

  // Load existing row to preserve encrypted values when mask placeholder is sent
  const existing = await (prisma as any).commProviderConfig.findUnique({
    where: { providerName },
  })
  const existingCfg = (existing?.configJson ?? {}) as Record<string, string | undefined>

  // For each secret field, encrypt the new value OR keep existing if masked
  const secretFields: Record<string, string[]> = {
    twilio: ['authToken'],
    telnyx: ['apiKey'],
    signalhouse: ['apiToken'],
  }

  const mergedCfg: Record<string, string | undefined> = {}

  for (const [key, value] of Object.entries(newCfg)) {
    if (value === undefined || value === '') continue
    if (secretFields[providerName]?.includes(key)) {
      // Keep existing encrypted value if the masked placeholder is sent
      if (value === MASK_PLACEHOLDER) {
        mergedCfg[key] = existingCfg[key]
      } else {
        mergedCfg[key] = encrypt(value)
      }
    } else {
      mergedCfg[key] = value
    }
  }

  // Upsert target row as active
  await (prisma as any).commProviderConfig.upsert({
    where: { providerName },
    create: {
      providerName,
      isActive: true,
      defaultNumber: defaultNumber ?? null,
      configJson: mergedCfg,
    },
    update: {
      isActive: true,
      defaultNumber: defaultNumber ?? null,
      configJson: mergedCfg,
    },
  })

  // Deactivate all others
  await (prisma as any).commProviderConfig.updateMany({
    where: { providerName: { not: providerName } },
    data: { isActive: false },
  })

  // Bust resolver cache
  refreshCommConfig()

  return NextResponse.json({ success: true })
}
