/**
 * Singleton CompanySettings table — holds CRM-wide configuration that
 * applies to every user regardless of their machine/browser locale.
 *
 *   CompanySettings.id        TEXT  — always 'singleton' (enforced via PK)
 *   CompanySettings.timezone  TEXT  — IANA zone (e.g. 'America/Chicago')
 *
 * Default is 'America/Chicago' since that matches the operator's
 * baseline US-Central market. Admin users update this via Settings →
 * General → Company Timezone; everyone else (any user role) uses it
 * for display + scheduling no matter where they're working from.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    CREATE TABLE IF NOT EXISTS "CompanySettings" (
      "id"        TEXT PRIMARY KEY,
      "timezone"  TEXT NOT NULL DEFAULT 'America/Chicago',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "CompanySettings_singleton_chk" CHECK ("id" = 'singleton')
    );
  `)
  // Seed the singleton row so getters never have to handle the empty case.
  await context.sequelize.query(`
    INSERT INTO "CompanySettings" ("id", "timezone")
    VALUES ('singleton', 'America/Chicago')
    ON CONFLICT ("id") DO NOTHING;
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`DROP TABLE IF EXISTS "CompanySettings";`)
}
