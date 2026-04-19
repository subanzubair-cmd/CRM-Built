/**
 * Data migration: ExitStrategy enum values
 *
 * WHOLESALE         → WHOLESALE_ASSIGNMENT
 * INVENTORY_LATER   → NULL  (replaced by Route B exits)
 *
 * Run AFTER `pnpm db:push --accept-data-loss`
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js'

const prisma = new PrismaClient()

async function main() {
  // Map WHOLESALE → WHOLESALE_ASSIGNMENT
  const wholesaleResult = await prisma.$executeRaw`
    UPDATE "Property"
    SET "exitStrategy" = 'WHOLESALE_ASSIGNMENT'::"ExitStrategy"
    WHERE "exitStrategy" = 'WHOLESALE'::"ExitStrategy"
  `
  console.log(`Migrated ${wholesaleResult} WHOLESALE → WHOLESALE_ASSIGNMENT`)

  // NULL out INVENTORY_LATER
  const inventoryResult = await prisma.$executeRaw`
    UPDATE "Property"
    SET "exitStrategy" = NULL
    WHERE "exitStrategy" = 'INVENTORY_LATER'::"ExitStrategy"
  `
  console.log(`Nulled ${inventoryResult} INVENTORY_LATER records`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
