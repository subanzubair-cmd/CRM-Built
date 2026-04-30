/**
 * Umzug equivalent of Prisma migration `20260409101039_init_full_schema`.
 *
 * The original Prisma migration was 699 lines of raw SQL — the entire
 * initial schema. We wrap it byte-identically by reading the sibling
 * `.sql` file. Down is irreversible (would require dropping the whole DB).
 *
 * On any environment that already has the schema (i.e. Prisma already ran
 * this migration), the bootstrap step in `umzug.ts` pre-inserts a row in
 * `SequelizeMeta` so this migration is recorded as already applied and
 * never re-runs.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

// __dirname doesn't exist in ESM — derive it from import.meta.url so
// this migration keeps reading the sibling .sql file regardless of
// how it's loaded (umzug CLI, vitest, or app boot).
const __dirname = dirname(fileURLToPath(import.meta.url))
const SQL_PATH = resolve(__dirname, 'sql', '20260409101039-init-full-schema.sql')

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  const sql = readFileSync(SQL_PATH, 'utf8')
  await context.sequelize.query(sql)
  // The pg_dump output sets `search_path = ''` (empty) for the rest of the
  // session via `SELECT pg_catalog.set_config('search_path', '', false)`.
  // Restore it so subsequent Umzug operations (recording success in
  // SequelizeMeta) and ORM queries can resolve unqualified relations.
  await context.sequelize.query(`SET search_path TO "$user", public;`)
}

export const down: MigrationFn<QueryInterface> = async () => {
  throw new Error(
    '20260409101039-init-full-schema is irreversible. Drop the database to undo.',
  )
}
