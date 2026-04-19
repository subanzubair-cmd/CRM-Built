#!/usr/bin/env node
/**
 * Convert Template.templateType and StatusAutomation.workspaceType from
 * free-form strings to Postgres enums. Idempotent — no-ops if the types
 * are already enums.
 *
 * Run BEFORE `prisma db push` when rolling out the enum schema change.
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js'

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function columnIsEnum(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT data_type, udt_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    table,
    column,
  )
  return rows[0]?.data_type === 'USER-DEFINED'
}

async function typeExists(typeName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM pg_type WHERE typname = $1`,
    typeName,
  )
  return rows.length > 0
}

async function ensureEnum(typeName, values) {
  if (!(await typeExists(typeName))) {
    const valsSql = values.map((v) => `'${v}'`).join(', ')
    await prisma.$executeRawUnsafe(`CREATE TYPE "${typeName}" AS ENUM (${valsSql})`)
    console.log(`✓ Created enum ${typeName}`)
  } else {
    console.log(`= Enum ${typeName} already exists`)
  }
}

async function inspectColumnValues(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT "${column}" AS v FROM "${table}"`,
  )
  return rows.map((r) => r.v).filter((v) => v != null)
}

async function migrateColumn(table, column, typeName, allowedValues) {
  if (await columnIsEnum(table, column)) {
    console.log(`= ${table}.${column} is already an enum`)
    return
  }
  const existing = await inspectColumnValues(table, column)
  const invalid = existing.filter((v) => !allowedValues.includes(v))
  if (invalid.length > 0) {
    console.error(
      `✗ ${table}.${column} contains values not in enum: ${invalid.join(', ')}\n` +
        `   Fix manually before retrying (e.g. UPDATE "${table}" SET "${column}" = 'xxx' WHERE "${column}" = 'yyy')`,
    )
    process.exit(1)
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE "${typeName}" USING "${column}"::"${typeName}"`,
  )
  console.log(`✓ Migrated ${table}.${column} to ${typeName}`)
}

async function main() {
  await ensureEnum('TemplateType', ['sms', 'email', 'rvm', 'task', 'direct_mail'])
  await ensureEnum('WorkspaceType', ['leads', 'tm', 'inventory', 'sold', 'rental'])

  await migrateColumn('Template', 'templateType', 'TemplateType', ['sms', 'email', 'rvm', 'task', 'direct_mail'])
  await migrateColumn('StatusAutomation', 'workspaceType', 'WorkspaceType', ['leads', 'tm', 'inventory', 'sold', 'rental'])
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
