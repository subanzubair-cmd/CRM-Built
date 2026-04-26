/**
 * Local webhook tunnel — exposes localhost:3000 to a public HTTPS URL via ngrok
 * so Twilio/Telnyx can deliver inbound SMS, call status, and signed webhooks
 * to your dev box in real time.
 *
 *   pnpm tunnel
 *
 * Setup (one-time):
 *   1. Sign up at https://dashboard.ngrok.com (free tier works)
 *   2. Copy your auth token from https://dashboard.ngrok.com/get-started/your-authtoken
 *   3. Add to apps/web/.env.local:
 *        NGROK_AUTHTOKEN=your_token_here
 *        # Optional — only if you have a paid plan with a reserved subdomain:
 *        # NGROK_DOMAIN=homewardpartners-dev.ngrok.app
 *   4. Run `pnpm tunnel` (in a separate terminal from `pnpm dev`)
 *
 * The script prints the exact webhook URLs to paste into the Twilio + Telnyx
 * dashboards. On Ctrl+C the tunnel closes cleanly and the URL becomes invalid
 * (good — nothing is left exposed).
 *
 * Security notes:
 *   - .env.local is gitignored, so the auth token never reaches the repo
 *   - Webhook routes verify provider signatures (Twilio + Telnyx) — even if
 *     someone discovers the URL, unsigned/forged requests are rejected
 *   - Free-tier URLs rotate on every restart; paid plans get a stable
 *     reserved subdomain so you can update Twilio/Telnyx once and forget
 */
import 'reflect-metadata'
import * as ngrok from '@ngrok/ngrok'
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Load apps/web/.env.local first (preferred), fall back to repo-root .env
const candidates = [
  resolve(process.cwd(), 'apps/web/.env.local'),
  resolve(process.cwd(), 'apps/web/.env'),
  resolve(process.cwd(), '.env.local'),
  resolve(process.cwd(), '.env'),
]
for (const p of candidates) {
  if (existsSync(p)) loadEnv({ path: p, override: false })
}

const PORT = Number(process.env.TUNNEL_PORT ?? 3000)
const AUTHTOKEN = process.env.NGROK_AUTHTOKEN
const DOMAIN = process.env.NGROK_DOMAIN

if (!AUTHTOKEN) {
  console.error(
    '\n❌ NGROK_AUTHTOKEN missing.\n\n' +
      '   1. Sign up free at https://dashboard.ngrok.com\n' +
      '   2. Copy your token from https://dashboard.ngrok.com/get-started/your-authtoken\n' +
      '   3. Add NGROK_AUTHTOKEN=... to apps/web/.env.local\n' +
      '   4. Re-run `pnpm tunnel`\n',
  )
  process.exit(1)
}

async function main() {
  console.log(`\n🔌 Starting ngrok tunnel → http://localhost:${PORT}\n`)

  const listener = await ngrok.forward({
    addr: PORT,
    authtoken: AUTHTOKEN,
    ...(DOMAIN ? { domain: DOMAIN } : {}),
  })

  const url = listener.url()
  if (!url) {
    console.error('❌ Tunnel started but no public URL returned. Check ngrok status.')
    process.exit(1)
  }

  const httpsUrl = url.startsWith('http://') ? url.replace('http://', 'https://') : url

  // Pretty-print the URLs the user needs to paste into provider dashboards.
  const sep = '─'.repeat(72)
  console.log(`\n✅ Tunnel live\n`)
  console.log(sep)
  console.log(`   Public URL:  ${httpsUrl}`)
  console.log(`   Forwarding:  http://localhost:${PORT}`)
  console.log(`   Inspector:   http://localhost:4040  (live request log)`)
  console.log(sep)
  console.log(`\n📥 Paste these into your provider dashboards:\n`)
  console.log(`   Twilio (Phone Numbers → Number → Messaging Webhook):`)
  console.log(`     ${httpsUrl}/api/webhooks/twilio\n`)
  console.log(`   Twilio (Voice Webhook):`)
  console.log(`     ${httpsUrl}/api/webhooks/twilio-call\n`)
  console.log(`   Telnyx (Messaging Profiles → Inbound Webhook URL):`)
  console.log(`     ${httpsUrl}/api/webhooks/telnyx\n`)
  console.log(`   Telnyx (Voice API Application → Webhook URL):`)
  console.log(`     ${httpsUrl}/api/webhooks/telnyx-call\n`)
  console.log(sep)
  console.log(`\n💡 Tips:`)
  console.log(`   • Open ${httpsUrl} in a browser to confirm the CRM is reachable`)
  console.log(`   • Watch http://localhost:4040 to see every inbound webhook hit live`)
  console.log(`   • Press Ctrl+C to close the tunnel cleanly`)
  if (!DOMAIN) {
    console.log(`\n⚠  This URL changes every restart (free tier).`)
    console.log(`   Set NGROK_DOMAIN in apps/web/.env.local for a stable URL`)
    console.log(`   (requires paid ngrok plan, ~$8/mo).`)
  }
  console.log()

  // Keep the process alive. ngrok's listener already holds the connection
  // open, but we add an explicit handler so Ctrl+C disconnects cleanly.
  process.on('SIGINT', async () => {
    console.log('\n🛑 Closing tunnel…')
    await listener.close().catch(() => {})
    process.exit(0)
  })
  process.on('SIGTERM', async () => {
    await listener.close().catch(() => {})
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('❌ Tunnel failed:', err?.message ?? err)
  process.exit(1)
})
