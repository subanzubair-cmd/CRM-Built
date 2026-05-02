/**
 * scripts/wipe-test-data.ts
 *
 * Wipes all operational/test data while preserving system configuration:
 * users, roles, campaigns, pipeline stages, TwilioNumbers, etc.
 *
 * Safety rules:
 *   - Requires WIPE_TEST_DATA_CONFIRM_TARGET=I_KNOW_THIS_IS_NOT_PROD (positive opt-in).
 *   - Also refuses to run if NODE_ENV=production or DATABASE_URL contains
 *     known production hostname signals.
 *   - Prints row counts BEFORE wiping, then asks for confirmation.
 *   - Runs the entire TRUNCATE in a single transaction (atomic).
 *
 * Run:
 *   WIPE_TEST_DATA_CONFIRM_TARGET=I_KNOW_THIS_IS_NOT_PROD \
 *   DATABASE_URL=postgres://... pnpm tsx scripts/wipe-test-data.ts
 *
 *   # Add --yes to skip the interactive "yes" prompt (e.g. in CI).
 */

import { Client } from 'pg'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

// ─── Configuration ─────────────────────────────────────────────────────────

/**
 * Tables wiped in this order (most-dependent first so FKs don't block).
 * CASCADE on the TRUNCATE handles anything we miss — the ordering is for
 * clarity in pg logs.
 */
const WIPE_TABLES = [
  // ── Communications / activity ──
  'ActiveCall',
  'ActivityLog',
  'Message',
  'Conversation',
  // ── Lead activity ──
  'Note',
  'Task',
  'Appointment',
  'StageHistory',
  'Notification',
  'AiLog',
  'AiConversation',
  // ── Files ──
  'PropertyFile',
  'GlobalFile',
  'GlobalFolder',
  // ── Buyer / Vendor pipeline ──
  'BuyerOffer',
  'BuyerMatch',
  'BuyerCriteria',
  'Buyer',
  'Vendor',
  'LeadOffer',
  // ── Bulk SMS ──
  'BulkSmsBlastRecipient',
  'BulkSmsBlast',
  // ── Drip enrollments (keep Campaign / CampaignStep templates) ──
  'CampaignEnrollment',
  // ── Imports ──
  'ImportJobRow',
  'ImportJob',
  // ── E-sign / financial transactions (keep templates & accounts) ──
  'EsignDocument',
  'FinancialTransaction',
  // ── Webhook events (keep Webhook config rows) ──
  'WebhookEvent',
  // ── Lead joins ──
  'PropertyTeamAssignment',
  'PropertyContact',
  'AdditionalContact',
  // ── Core: leads & contacts (delete last; parents of everything above) ──
  'Property',
  'Contact',
]

/**
 * Tables intentionally preserved:
 *   User, Role, UserRoleConfig, UserCampaignAssignment,
 *   TwilioNumber, CommProviderConfig,
 *   LeadCampaign, LeadCampaignUser, LeadCampaignRoleToggle,
 *   Campaign, CampaignStep,
 *   PipelineStageConfig,
 *   Automation, AutomationAction, StatusAutomation,
 *   AccountTag, Tag, Template,
 *   CustomFormConfig, WebFormConfig, CompanySettings,
 *   AiConfiguration,
 *   SavedFilter, SavedFilterFolder, SavedFilterShare,
 *   ApiToken, Webhook,
 *   LeadSource, ListStackSource, Market,
 *   DirectMailCampaign, EsignTemplate,
 *   FinancialAccount, FinancialGoal
 */

// URL fragments that, if present, suggest a production database.
// NOTE: this list is intentionally NOT the primary safety gate — the
// WIPE_TEST_DATA_CONFIRM_TARGET env var is. This is a secondary guard
// that catches accidental tunnel-to-prod scenarios where the URL itself
// contains obvious signals.
const PROD_URL_SIGNALS = ['prod', 'production', 'rds.amazonaws.com', 'neon.tech', 'supabase']

// ─── Production guards ─────────────────────────────────────────────────────

function guardProduction(url: string): void {
  // Primary guard: require an explicit positive opt-in env var.
  // This catches local-tunnel-to-prod (URL = localhost), custom hostnames,
  // Render/Railway/Fly/Heroku databases, and any other case the URL-signal
  // list below doesn't cover.
  const target = process.env.WIPE_TEST_DATA_CONFIRM_TARGET ?? ''
  if (target !== 'I_KNOW_THIS_IS_NOT_PROD') {
    console.error('❌  Missing safety opt-in.')
    console.error('    Set WIPE_TEST_DATA_CONFIRM_TARGET=I_KNOW_THIS_IS_NOT_PROD to proceed.')
    console.error('    NEVER set this on a production server or in a production .env file.')
    process.exit(1)
  }

  // Secondary guard: bail on NODE_ENV=production regardless of env var.
  if (process.env.NODE_ENV === 'production') {
    console.error('❌  Refusing to run: NODE_ENV=production')
    process.exit(1)
  }

  // Tertiary guard: URL-signal heuristic.
  for (const signal of PROD_URL_SIGNALS) {
    if (url.toLowerCase().includes(signal)) {
      console.error(`❌  Refusing to run: DATABASE_URL contains "${signal}" (looks like production)`)
      process.exit(1)
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('❌  DATABASE_URL is not set.')
    console.error('    Run: DATABASE_URL=postgres://... pnpm tsx scripts/wipe-test-data.ts')
    process.exit(1)
  }

  guardProduction(url)

  const skipConfirm = process.argv.includes('--yes')

  const client = new Client({ connectionString: url })
  await client.connect()

  try {
    console.log('\n🔍  Checking which tables exist in this database...\n')

    // Only truncate tables that actually exist — prevents errors on freshly
    // migrated DBs that are missing stale entries from the list.
    const { rows: existing } = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [WIPE_TABLES],
    )
    const existingSet = new Set(existing.map((r) => r.table_name))
    const presentTables = WIPE_TABLES.filter((t) => existingSet.has(t))
    const skipped = WIPE_TABLES.filter((t) => !existingSet.has(t))

    if (skipped.length) {
      console.log(`  Skipping (table not found): ${skipped.join(', ')}\n`)
    }

    // ── Print row counts before wipe ──
    console.log('📊  Row counts BEFORE wipe:\n')
    let grandTotal = 0
    const counts: Record<string, number> = {}
    for (const t of presentTables) {
      const { rows } = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "${t}";`)
      counts[t] = rows[0].n
      grandTotal += counts[t]
      if (counts[t] > 0) {
        console.log(`  ${t.padEnd(30)} ${counts[t].toLocaleString()} rows`)
      }
    }
    console.log(`\n  ${'TOTAL'.padEnd(30)} ${grandTotal.toLocaleString()} rows`)

    if (grandTotal === 0) {
      console.log('\n✅  Nothing to wipe — all tables are already empty.')
      return
    }

    // ── Confirmation ──
    if (!skipConfirm) {
      const rl = readline.createInterface({ input, output })
      const answer = await rl.question(
        `\n⚠️   This will permanently delete ${grandTotal.toLocaleString()} rows. Type "yes" to continue: `,
      )
      rl.close()
      if (answer.trim().toLowerCase() !== 'yes') {
        console.log('\n🚫  Aborted. No data was changed.')
        return
      }
    }

    // ── Truncate ──
    console.log('\n🗑️   Wiping...\n')
    const tableList = presentTables.map((t) => `"${t}"`).join(', ')
    const sql = `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`

    await client.query('BEGIN;')
    try {
      await client.query(sql)
      await client.query('COMMIT;')
    } catch (err) {
      await client.query('ROLLBACK;')
      console.error('\n❌  TRUNCATE failed — rolled back:', err)
      process.exit(1)
    }

    // ── Verify ──
    console.log('✅  Row counts AFTER wipe:\n')
    for (const t of presentTables) {
      const { rows } = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "${t}";`)
      const n = rows[0].n
      if (n !== 0) {
        console.log(`  ⚠️  ${t}: ${n} rows remain (cascades may have missed some)`)
      }
    }

    console.log('\n✅  Wipe complete. All test data removed; system configuration preserved.\n')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('❌  Unhandled error:', err)
  process.exit(1)
})
