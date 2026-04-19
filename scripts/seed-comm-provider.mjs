import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js'
import crypto from 'crypto'

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

function getKey() {
  const secret =
    process.env.CONFIG_ENCRYPTION_KEY ??
    process.env.AUTH_SECRET ??
    'dev-fallback-secret-change-in-production'
  return crypto.createHash('sha256').update(secret).digest()
}

function encrypt(plaintext) {
  if (!plaintext) return ''
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), encrypted.toString('base64'), tag.toString('base64')].join(':')
}

const PROVIDERS = ['twilio', 'telnyx', 'signalhouse']

async function main() {
  const hasTwilioEnv = !!(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  )

  for (const providerName of PROVIDERS) {
    // Pre-fill Twilio row with env values if set, so outbound traffic keeps working
    let defaultNumber = null
    let configJson = {}
    let isActive = false

    if (providerName === 'twilio' && hasTwilioEnv) {
      defaultNumber = process.env.TWILIO_DEFAULT_NUMBER ?? null
      configJson = {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: encrypt(process.env.TWILIO_AUTH_TOKEN),
        twimlHost: process.env.TWILIO_TWIML_HOST ?? undefined,
      }
      isActive = true
    }

    await prisma.commProviderConfig.upsert({
      where: { providerName },
      create: { providerName, isActive, defaultNumber, configJson },
      update: {}, // don't clobber existing on re-run
    })
  }

  const rows = await prisma.commProviderConfig.findMany()
  console.log('Seeded CommProviderConfig:')
  for (const r of rows) {
    console.log(`  ${r.providerName.padEnd(14)} active=${r.isActive}  default=${r.defaultNumber ?? '-'}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
