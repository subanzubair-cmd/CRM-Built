/**
 * Umzug CLI — invoked via `pnpm db:migrate:sequelize <up|down|status>`.
 *
 * Kept tiny on purpose. For complex scenarios (creating new migrations,
 * generating boilerplate) we'll add helpers as the migration progresses.
 */
import 'dotenv/config'
import { migrateUp, migrateDownLast, migrateStatus } from './umzug'
import { sequelize } from '../sequelize'

async function main() {
  const cmd = process.argv[2] ?? 'status'
  try {
    if (cmd === 'up') {
      await migrateUp()
      console.log('✓ Sequelize migrations up to date')
    } else if (cmd === 'down') {
      await migrateDownLast()
      console.log('✓ Reverted last Sequelize migration')
    } else if (cmd === 'status') {
      const { applied, pending } = await migrateStatus()
      console.log('Applied:')
      applied.forEach((n) => console.log(`  ✓ ${n}`))
      console.log('Pending:')
      if (pending.length === 0) console.log('  (none)')
      else pending.forEach((n) => console.log(`  ☐ ${n}`))
    } else {
      console.error(`Unknown command: ${cmd} (expected: up | down | status)`)
      process.exit(2)
    }
  } finally {
    await sequelize.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
