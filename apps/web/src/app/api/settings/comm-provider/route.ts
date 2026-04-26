import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { CommProviderConfig, Op } from '@crm/database'
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

export async function GET() {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  for (const name of PROVIDERS) {
    await CommProviderConfig.findOrCreate({
      where: { providerName: name },
      defaults: { providerName: name, isActive: false } as any,
    })
  }

  const rows = await CommProviderConfig.findAll({ raw: true }) as any[]

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
      masked.webhookSecret = maskSecret(cfg.webhookSecret)
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
  webhookSecret: z.string().optional(),
})

const PutBodySchema = z.discriminatedUnion('providerName', [
  z.object({ providerName: z.literal('twilio'), defaultNumber: z.string().optional(), config: TwilioCfg }),
  z.object({ providerName: z.literal('telnyx'), defaultNumber: z.string().optional(), config: TelnyxCfg }),
  z.object({ providerName: z.literal('signalhouse'), defaultNumber: z.string().optional(), config: SignalHouseCfg }),
])

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

  const existing = await CommProviderConfig.findOne({
    where: { providerName },
    raw: true,
  }) as any
  const existingCfg = (existing?.configJson ?? {}) as Record<string, string | undefined>

  const secretFields: Record<string, string[]> = {
    twilio: ['authToken'],
    telnyx: ['apiKey'],
    signalhouse: ['apiToken', 'webhookSecret'],
  }

  const mergedCfg: Record<string, string | undefined> = {}

  for (const [key, value] of Object.entries(newCfg)) {
    if (value === undefined || value === '') continue
    if (secretFields[providerName]?.includes(key)) {
      if (value === MASK_PLACEHOLDER) {
        mergedCfg[key] = existingCfg[key]
      } else {
        mergedCfg[key] = encrypt(value)
      }
    } else {
      mergedCfg[key] = value
    }
  }

  const [row, created] = await CommProviderConfig.findOrCreate({
    where: { providerName },
    defaults: {
      providerName,
      isActive: true,
      defaultNumber: defaultNumber ?? null,
      configJson: mergedCfg,
    } as any,
  })
  if (!created) {
    await row.update({
      isActive: true,
      defaultNumber: defaultNumber ?? null,
      configJson: mergedCfg,
    })
  }

  await CommProviderConfig.update(
    { isActive: false },
    { where: { providerName: { [Op.ne]: providerName } } },
  )

  refreshCommConfig()

  return NextResponse.json({ success: true })
}
