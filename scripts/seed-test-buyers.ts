/**
 * One-shot seed: creates 3 test buyers with the phone numbers the
 * user gave. Idempotent — re-running it skips any phone that already
 * has a Contact (so we don't double-insert).
 *
 * Run with:
 *   pnpm tsx scripts/seed-test-buyers.ts
 */

import 'dotenv/config'
import { sequelize, Contact, Buyer, Op } from '@crm/database'

const TEST_BUYERS = [
  { firstName: 'Test', lastName: 'Buyer One',   phone: '+14697997747' },
  { firstName: 'Test', lastName: 'Buyer Two',   phone: '+14696667161' },
  { firstName: 'Test', lastName: 'Buyer Three', phone: '+18565159866' },
]

async function main() {
  await sequelize.authenticate()

  const created: string[] = []
  const skipped: string[] = []

  for (const b of TEST_BUYERS) {
    const existing = await Contact.findOne({
      where: { phone: b.phone, type: 'BUYER' as any } as any,
    })
    if (existing) {
      skipped.push(`${b.firstName} ${b.lastName} (${b.phone})`)
      continue
    }
    const contact = await Contact.create({
      type: 'BUYER' as any,
      firstName: b.firstName,
      lastName: b.lastName,
      phone: b.phone,
      phones: [{ label: 'primary', number: b.phone }],
      emails: [],
    } as any)
    await Buyer.create({ contactId: contact.id, isActive: true } as any)
    created.push(`${b.firstName} ${b.lastName} (${b.phone})`)
  }

  console.log(`✓ created ${created.length}:`)
  for (const c of created) console.log(`   - ${c}`)
  if (skipped.length > 0) {
    console.log(`✓ skipped ${skipped.length} (already existed):`)
    for (const s of skipped) console.log(`   - ${s}`)
  }

  await sequelize.close()
}

main().catch((err) => {
  console.error('seed-test-buyers failed:', err)
  process.exit(1)
})
