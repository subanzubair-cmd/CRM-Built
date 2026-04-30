/**
 * BulkSmsBlast + BulkSmsBlastRecipient — separate from `Campaign` so
 * the drip-campaigns surface and the buyers SMS Campaign tab don't
 * share state. The user explicitly called out the leak: any DRIP
 * campaign with at least one SMS step was showing up under
 * /buyers?tab=sms-campaign because there was no type filter. Moving
 * to a dedicated table eliminates the class of bug entirely.
 *
 * Recipient rows are polymorphic on subjectType (CONTACT / BUYER /
 * VENDOR) — the v1 spec ships BUYERS only but VENDORS will follow
 * the same shape, and the LEADS module also uses Contact rows for
 * inbound senders, so we want to keep the relation generic from the
 * start.
 *
 * Each recipient links to its outbound `Message` row via messageId
 * (nullable until the worker actually fires the send) and carries a
 * `providerMessageId` so the Telnyx delivery webhook can update the
 * recipient row directly without going through Message.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BulkSmsBlastModule') THEN
        CREATE TYPE "BulkSmsBlastModule" AS ENUM ('BUYERS','VENDORS','LEADS','SOLD');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BulkSmsBlastStatus') THEN
        CREATE TYPE "BulkSmsBlastStatus" AS ENUM ('QUEUED','SENDING','COMPLETED','FAILED','CANCELLED');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BulkSmsBlastRecipientStatus') THEN
        CREATE TYPE "BulkSmsBlastRecipientStatus" AS ENUM
          ('QUEUED','SENT','DELIVERED','FAILED','SKIPPED_DND','SKIPPED_INVALID');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BulkSmsBlastRecipientSubjectType') THEN
        CREATE TYPE "BulkSmsBlastRecipientSubjectType" AS ENUM ('CONTACT','BUYER','VENDOR');
      END IF;
    END$$;
  `)

  await context.sequelize.query(`
    CREATE TABLE IF NOT EXISTS "BulkSmsBlast" (
      "id"                       TEXT PRIMARY KEY,
      "module"                   "BulkSmsBlastModule" NOT NULL,
      "name"                     TEXT NOT NULL,
      "body"                     TEXT NOT NULL,
      "fromPhoneNumberId"        TEXT,
      "createdById"              TEXT,
      "recipientFilterSnapshot"  JSONB NOT NULL DEFAULT '{}'::jsonb,
      "recipientCount"           INT NOT NULL DEFAULT 0,
      "sentCount"                INT NOT NULL DEFAULT 0,
      "deliveredCount"           INT NOT NULL DEFAULT 0,
      "failedCount"              INT NOT NULL DEFAULT 0,
      "status"                   "BulkSmsBlastStatus" NOT NULL DEFAULT 'QUEUED',
      "scheduledAt"              TIMESTAMPTZ,
      "startedAt"                TIMESTAMPTZ,
      "completedAt"              TIMESTAMPTZ,
      "createdAt"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"                TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS "BulkSmsBlast_module_createdAt_idx"
      ON "BulkSmsBlast" ("module", "createdAt" DESC);
    CREATE INDEX IF NOT EXISTS "BulkSmsBlast_status_idx"
      ON "BulkSmsBlast" ("status") WHERE "status" IN ('QUEUED','SENDING');
    CREATE INDEX IF NOT EXISTS "BulkSmsBlast_createdById_idx"
      ON "BulkSmsBlast" ("createdById");
  `)

  await context.sequelize.query(`
    CREATE TABLE IF NOT EXISTS "BulkSmsBlastRecipient" (
      "id"                  TEXT PRIMARY KEY,
      "blastId"             TEXT NOT NULL REFERENCES "BulkSmsBlast"("id") ON DELETE CASCADE,
      "subjectType"         "BulkSmsBlastRecipientSubjectType" NOT NULL,
      "subjectId"           TEXT NOT NULL,
      "phone"               TEXT NOT NULL,
      "messageId"           TEXT,
      "status"              "BulkSmsBlastRecipientStatus" NOT NULL DEFAULT 'QUEUED',
      "failReason"          TEXT,
      "providerMessageId"   TEXT,
      "sentAt"              TIMESTAMPTZ,
      "deliveredAt"         TIMESTAMPTZ,
      "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS "BulkSmsBlastRecipient_blastId_idx"
      ON "BulkSmsBlastRecipient" ("blastId");
    CREATE INDEX IF NOT EXISTS "BulkSmsBlastRecipient_status_idx"
      ON "BulkSmsBlastRecipient" ("blastId", "status");
    CREATE UNIQUE INDEX IF NOT EXISTS "BulkSmsBlastRecipient_provider_idx"
      ON "BulkSmsBlastRecipient" ("providerMessageId")
      WHERE "providerMessageId" IS NOT NULL;
  `)

  // Link Message to BulkSmsBlast so we can show "this message was
  // part of blast XYZ" on the message timeline.
  await context.sequelize.query(`
    ALTER TABLE "Message"
      ADD COLUMN IF NOT EXISTS "bulkSmsBlastId" TEXT;
    CREATE INDEX IF NOT EXISTS "Message_bulkSmsBlastId_idx"
      ON "Message" ("bulkSmsBlastId") WHERE "bulkSmsBlastId" IS NOT NULL;
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    DROP INDEX IF EXISTS "Message_bulkSmsBlastId_idx";
    ALTER TABLE "Message" DROP COLUMN IF EXISTS "bulkSmsBlastId";

    DROP TABLE IF EXISTS "BulkSmsBlastRecipient";
    DROP TABLE IF EXISTS "BulkSmsBlast";

    DROP TYPE IF EXISTS "BulkSmsBlastRecipientSubjectType";
    DROP TYPE IF EXISTS "BulkSmsBlastRecipientStatus";
    DROP TYPE IF EXISTS "BulkSmsBlastStatus";
    DROP TYPE IF EXISTS "BulkSmsBlastModule";
  `)
}
