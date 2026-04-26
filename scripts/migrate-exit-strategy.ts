/**
 * Data migration: ExitStrategy enum values
 *
 *   WHOLESALE         → WHOLESALE_ASSIGNMENT
 *   INVENTORY_LATER   → NULL  (replaced by Route B exits)
 *
 * Run AFTER `pnpm db:migrate` has applied the schema change.
 *
 * Usage: npx tsx scripts/migrate-exit-strategy.ts
 */
import 'reflect-metadata'
import { sequelize } from '../packages/database/src'

async function main() {
  const [, wholesaleMeta] = await sequelize.query(`
    UPDATE "Property"
    SET "exitStrategy" = 'WHOLESALE_ASSIGNMENT'::"ExitStrategy"
    WHERE "exitStrategy" = 'WHOLESALE'::"ExitStrategy"
  `)
  // Sequelize's query() returns [results, metadata]. For UPDATE on Postgres,
  // metadata typically exposes `rowCount`.
  const wholesaleCount = (wholesaleMeta as { rowCount?: number })?.rowCount ?? 0
  console.log(`Migrated ${wholesaleCount} WHOLESALE → WHOLESALE_ASSIGNMENT`)

  const [, inventoryMeta] = await sequelize.query(`
    UPDATE "Property"
    SET "exitStrategy" = NULL
    WHERE "exitStrategy" = 'INVENTORY_LATER'::"ExitStrategy"
  `)
  const inventoryCount = (inventoryMeta as { rowCount?: number })?.rowCount ?? 0
  console.log(`Nulled ${inventoryCount} INVENTORY_LATER records`)
}

main()
  .catch(console.error)
  .finally(() => sequelize.close())
