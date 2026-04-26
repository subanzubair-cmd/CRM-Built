/**
 * Convert Template.templateType and StatusAutomation.workspaceType from
 * free-form strings to Postgres enums. Idempotent — no-ops if the types
 * are already enums.
 *
 * Run BEFORE applying the enum schema change via `pnpm db:migrate`.
 *
 * Usage: npx tsx scripts/migrate-enum-columns.ts
 */
import 'reflect-metadata'
import { sequelize, QueryTypes } from '../packages/database/src'

async function columnIsEnum(table: string, column: string): Promise<boolean> {
  const rows = await sequelize.query<{ data_type: string; udt_name: string }>(
    `SELECT data_type, udt_name FROM information_schema.columns WHERE table_name = :table AND column_name = :column`,
    { replacements: { table, column }, type: QueryTypes.SELECT },
  )
  return rows[0]?.data_type === 'USER-DEFINED'
}

async function typeExists(typeName: string): Promise<boolean> {
  const rows = await sequelize.query(
    `SELECT 1 FROM pg_type WHERE typname = :typeName`,
    { replacements: { typeName }, type: QueryTypes.SELECT },
  )
  return rows.length > 0
}

async function ensureEnum(typeName: string, values: string[]): Promise<void> {
  if (!(await typeExists(typeName))) {
    const valsSql = values.map((v) => `'${v}'`).join(', ')
    await sequelize.query(`CREATE TYPE "${typeName}" AS ENUM (${valsSql})`)
    console.log(`✓ Created enum ${typeName}`)
  } else {
    console.log(`= Enum ${typeName} already exists`)
  }
}

async function inspectColumnValues(table: string, column: string): Promise<string[]> {
  const rows = await sequelize.query<{ v: string | null }>(
    `SELECT DISTINCT "${column}" AS v FROM "${table}"`,
    { type: QueryTypes.SELECT },
  )
  return rows.map((r) => r.v).filter((v): v is string => v != null)
}

async function migrateColumn(
  table: string,
  column: string,
  typeName: string,
  allowedValues: string[],
): Promise<void> {
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
  await sequelize.query(
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
    await sequelize.close()
  })
