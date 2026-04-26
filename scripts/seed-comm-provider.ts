/**
 * Seed CommProviderConfig rows for the three supported providers (idempotent).
 * Pre-fills Twilio with env values if TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN
 * are set, so outbound traffic works out of the box.
 *
 * Usage: npx tsx scripts/seed-comm-provider.ts
 */
import 'reflect-metadata'
import crypto from 'crypto'
import { sequelize, CommProviderConfig } from '../packages/database/src'

function getKey(): Buffer {
  const secret =
    process.env.CONFIG_ENCRYPTION_KEY ??
    process.env.AUTH_SECRET ??
    'dev-fallback-secret-change-in-production'
  return crypto.createHash('sha256').update(secret).digest()
}

function encrypt(plaintext: string): string {
  if (!plaintext) return ''
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), encrypted.toString('base64'), tag.toString('base64')].join(':')
}

const PROVIDERS = ['twilio', 'telnyx', 'signalhouse'] as const

async function main() {
  const hasTwilioEnv = !!(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  )

  for (const providerName of PROVIDERS) {
    let defaultNumber: string | null = null
    let configJson: Record<string, string | undefined> = {}
    let isActive = false

    if (providerName === 'twilio' && hasTwilioEnv) {
      defaultNumber = process.env.TWILIO_DEFAULT_NUMBER ?? null
      configJson = {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: encrypt(process.env.TWILIO_AUTH_TOKEN!),
        twimlHost: process.env.TWILIO_TWIML_HOST ?? undefined,
      }
      isActive = true
    }

    // Idempotent: don't clobber existing on re-run.
    await CommProviderConfig.findOrCreate({
      where: { providerName },
      defaults: { providerName, isActive, defaultNumber, configJson } as any,
    })
  }

  const rows = await CommProviderConfig.findAll({ raw: true }) as unknown as Array<{
    providerName: string
    isActive: boolean
    defaultNumber: string | null
  }>
  console.log('Seeded CommProviderConfig:')
  for (const r of rows) {
    console.log(`  ${r.providerName.padEnd(14)} active=${r.isActive}  default=${r.defaultNumber ?? '-'}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => sequelize.close())
