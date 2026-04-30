/**
 * SavedFilterFolder + folderId on SavedFilter + SavedFilterShare.
 *
 * The Buyers Module spec ships a "Manage Filters" modal where a user
 * can group their saved filters into folders, share filters with
 * teammates at View / Edit level, and save filters as standalone
 * (folderId = NULL) or inside a folder. We piggyback on the existing
 * SavedFilter model — adding a nullable folderId FK so existing rows
 * keep working — and layer sharing as a separate join table so the
 * SavedFilter row itself stays small + the share matrix can be
 * audited / revoked independently.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SavedFilterShareLevel') THEN
        CREATE TYPE "SavedFilterShareLevel" AS ENUM ('NONE','VIEW','EDIT');
      END IF;
    END$$;
  `)

  await context.sequelize.query(`
    CREATE TABLE IF NOT EXISTS "SavedFilterFolder" (
      "id"         TEXT PRIMARY KEY,
      "userId"     TEXT NOT NULL,
      "name"       TEXT NOT NULL,
      "pipeline"   TEXT NOT NULL,
      "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "SavedFilterFolder_userId_name_pipeline_key"
        UNIQUE ("userId", "name", "pipeline")
    );

    CREATE INDEX IF NOT EXISTS "SavedFilterFolder_userId_pipeline_idx"
      ON "SavedFilterFolder" ("userId", "pipeline");
  `)

  await context.sequelize.query(`
    ALTER TABLE "SavedFilter"
      ADD COLUMN IF NOT EXISTS "folderId" TEXT,
      ADD COLUMN IF NOT EXISTS "description" TEXT,
      ADD COLUMN IF NOT EXISTS "shared" BOOLEAN NOT NULL DEFAULT false;

    CREATE INDEX IF NOT EXISTS "SavedFilter_folderId_idx"
      ON "SavedFilter" ("folderId") WHERE "folderId" IS NOT NULL;
  `)

  await context.sequelize.query(`
    CREATE TABLE IF NOT EXISTS "SavedFilterShare" (
      "id"             TEXT PRIMARY KEY,
      "savedFilterId"  TEXT NOT NULL REFERENCES "SavedFilter"("id") ON DELETE CASCADE,
      "userId"         TEXT NOT NULL,
      "level"          "SavedFilterShareLevel" NOT NULL DEFAULT 'NONE',
      "grantedById"    TEXT,
      "grantedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "SavedFilterShare_filter_user_key"
        UNIQUE ("savedFilterId", "userId")
    );

    CREATE INDEX IF NOT EXISTS "SavedFilterShare_userId_idx"
      ON "SavedFilterShare" ("userId");
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    DROP TABLE IF EXISTS "SavedFilterShare";
    DROP INDEX IF EXISTS "SavedFilter_folderId_idx";
    ALTER TABLE "SavedFilter"
      DROP COLUMN IF EXISTS "folderId",
      DROP COLUMN IF EXISTS "description",
      DROP COLUMN IF EXISTS "shared";
    DROP TABLE IF EXISTS "SavedFilterFolder";
    DROP TYPE  IF EXISTS "SavedFilterShareLevel";
  `)
}
