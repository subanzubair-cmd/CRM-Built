/**
 * Seed the default system LeadSource rows. Idempotent — re-running is safe.
 *
 * Usage: npx tsx scripts/seed-lead-sources.ts
 */
import 'reflect-metadata'
import { sequelize, LeadSource } from '../packages/database/src'

const DEFAULTS = [
  'Bandit Signs',
  'Billboard',
  'Cold Calling',
  'Craigslist',
  'Direct Mail',
  'Door Knocking',
  'Driving for Dollars',
  'Email Marketing',
  'Facebook Marketing',
  'For Sale by Owner',
  'Foreclosure Auction',
  'Google Adwords/PPC',
  'HVA',
  'Internet Marketing (SEO)',
  'MLS',
  'Magnetic Signs',
  'Newspaper',
  'Online Auction',
  'Other',
]

async function main() {
  for (const name of DEFAULTS) {
    const [row, created] = await LeadSource.findOrCreate({
      where: { name },
      defaults: { name, isSystem: true, isActive: true } as any,
    })
    if (!created) {
      await row.update({ isSystem: true } as any)
    }
  }
  const count = await LeadSource.count()
  console.log(`Seeded ${DEFAULTS.length} system lead sources. Total in DB: ${count}.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => sequelize.close())
