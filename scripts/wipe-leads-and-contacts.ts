/**
 * scripts/wipe-leads-and-contacts.ts
 *
 * Truncates every table that holds a lead, a contact, or anything that
 * references one. Used to start a fresh inbound-webhook test from a
 * clean slate. Keeps Users, Roles, LeadCampaigns, LeadSources, Markets,
 * TwilioNumber, CommProviderConfig — all the configuration the operator
 * has set up — intact.
 *
 * Run:  pnpm tsx scripts/wipe-leads-and-contacts.ts
 */

// Plain pg driver — avoids tsx/esbuild's decorator-handling issues
// with the Sequelize-typescript model files.
import { Client } from 'pg'

const TABLES = [
  // Most-dependent first; CASCADE handles transitive FK chains anyway
  // but ordering keeps the SQL readable in pg logs.
  'ActivityLog',
  'StageHistory',
  'Task',
  'Message',
  'Conversation',
  'ActiveCall',
  'PropertyContact',
  'PropertyTeamAssignment',
  'AssociatedProperty',
  'PropertyTag',
  'AssociatedLead',
  'Document',
  'Offer',
  'Appointment',
  'BuyerMatch',
  'AnalyticsEvent',
  'CommEvent',
  'ScheduledSms',
  'CampaignEnrollment',
  'Property',
  'Contact',
]

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL not set. Run with DATABASE_URL=... pnpm tsx ...')
    process.exit(1)
  }
  const client = new Client({ connectionString: url })
  await client.connect()

  console.log('🗑️  Wiping leads + contacts (and all dependent rows)...\n')

  // Find which of our target tables actually exist in this DB so we
  // don't error on a stale entry from the list.
  const { rows: existing } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [TABLES],
  )
  const presentTables = existing.map((r) => r.table_name)
  const missing = TABLES.filter((t) => !presentTables.includes(t))
  if (missing.length) console.log(`  (skipping non-existent tables: ${missing.join(', ')})\n`)

  const tableList = presentTables.map((t) => `"${t}"`).join(', ')
  const sql = `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`
  console.log(sql, '\n')

  await client.query(sql)

  // Sanity counts so the operator can confirm.
  for (const t of presentTables) {
    const { rows } = await client.query<{ n: string }>(`SELECT COUNT(*)::int AS n FROM "${t}";`)
    console.log(`  ${t}: ${rows[0].n}`)
  }

  console.log('\n✅ Done. Reset complete.')
  await client.end()
}

main().catch((err) => {
  console.error('❌ Wipe failed:', err)
  process.exit(1)
})
