import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    CREATE TABLE IF NOT EXISTS "AdditionalContact" (
      "id"           TEXT PRIMARY KEY,
      "subjectType"  TEXT NOT NULL,
      "subjectId"    TEXT NOT NULL,
      "relationship" TEXT NOT NULL,
      "firstName"    TEXT NOT NULL,
      "lastName"     TEXT,
      "phone"        TEXT,
      "email"        TEXT,
      "notes"        TEXT,
      "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS "idx_additional_contact_subject"
      ON "AdditionalContact" ("subjectType", "subjectId");
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    DROP TABLE IF EXISTS "AdditionalContact";
  `)
}
