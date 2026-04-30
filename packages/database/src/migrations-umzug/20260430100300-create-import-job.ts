/**
 * ImportJob + ImportJobRow — backs the Buyers Module's "Import Log"
 * tab and the per-row failure breakdown a user gets when their CSV
 * has bad data. The CSV file itself goes to MinIO; this table only
 * tracks job state + per-row status so the UI can show
 * "X of Y rows imported, Z failed" with a download link to the
 * error report.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImportJobStatus') THEN
        CREATE TYPE "ImportJobStatus" AS ENUM ('QUEUED','PROCESSING','COMPLETED','FAILED');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImportJobModule') THEN
        CREATE TYPE "ImportJobModule" AS ENUM ('BUYERS','VENDORS');
      END IF;
    END$$;
  `)

  await context.sequelize.query(`
    CREATE TABLE IF NOT EXISTS "ImportJob" (
      "id"             TEXT PRIMARY KEY,
      "module"         "ImportJobModule" NOT NULL,
      "createdById"    TEXT,
      "fileName"       TEXT NOT NULL,
      "fileSize"       INT NOT NULL DEFAULT 0,
      "fileStorageKey" TEXT,
      "totalRows"      INT NOT NULL DEFAULT 0,
      "processedRows"  INT NOT NULL DEFAULT 0,
      "failedRows"     INT NOT NULL DEFAULT 0,
      "status"         "ImportJobStatus" NOT NULL DEFAULT 'QUEUED',
      "errorMessage"   TEXT,
      "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "completedAt"    TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS "ImportJob_module_createdAt_idx"
      ON "ImportJob" ("module", "createdAt" DESC);
  `)

  await context.sequelize.query(`
    CREATE TABLE IF NOT EXISTS "ImportJobRow" (
      "id"           TEXT PRIMARY KEY,
      "jobId"        TEXT NOT NULL REFERENCES "ImportJob"("id") ON DELETE CASCADE,
      "rowIndex"     INT NOT NULL,
      "succeeded"    BOOLEAN NOT NULL,
      "error"        TEXT,
      "rawRow"       JSONB,
      "createdEntityId"  TEXT,
      "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS "ImportJobRow_jobId_idx"
      ON "ImportJobRow" ("jobId", "rowIndex");
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    DROP TABLE IF EXISTS "ImportJobRow";
    DROP TABLE IF EXISTS "ImportJob";
    DROP TYPE  IF EXISTS "ImportJobStatus";
    DROP TYPE  IF EXISTS "ImportJobModule";
  `)
}
