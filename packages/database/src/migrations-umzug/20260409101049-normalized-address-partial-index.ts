/**
 * Umzug equivalent of Prisma migration
 * `20260409101049_normalized_address_partial_index`.
 *
 * Adds a partial unique index on `Property.normalizedAddress` that allows
 * NULL but prevents duplicates among non-null values.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

const INDEX_NAME = 'unique_normalized_address_when_not_null'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  // Use raw SQL — Sequelize's `addIndex` doesn't take a `WHERE` clause across
  // all dialects, and matching the original Prisma migration verbatim is
  // safer than translating to QueryInterface helpers.
  await context.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "${INDEX_NAME}"
    ON "Property" ("normalizedAddress")
    WHERE "normalizedAddress" IS NOT NULL;
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`DROP INDEX IF EXISTS "${INDEX_NAME}";`)
}
