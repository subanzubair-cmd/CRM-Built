/**
 * Convert legacy SELLERS lead-campaign type → DTS.
 *
 * Usage: npx tsx scripts/migrate-sellers-to-dts.ts
 */
import 'reflect-metadata'
import { sequelize, LeadCampaign } from '../packages/database/src'

async function main() {
  const [count] = await LeadCampaign.update(
    { type: 'DTS' as any },
    { where: { type: 'SELLERS' as any } },
  )
  console.log(`Converted ${count} SELLERS campaign(s) to DTS`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => sequelize.close())
