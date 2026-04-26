/**
 * Adds call recording capture so the CRM can play back call audio in the
 * call activity feed + Phone Numbers detail page.
 *
 *   ActiveCall.recordingUrl       TEXT — provider-hosted MP3/WAV URL
 *   ActiveCall.recordingDuration  INT  — seconds (rounded)
 *   ActiveCall.recordingSid       TEXT — provider's recording identifier
 *
 *   CommProviderConfig.enableCallRecording BOOL — toggle (default false)
 *
 * The Telnyx webhook handler reads enableCallRecording on `call.answered`
 * to start recording, and on `call.recording.saved` to persist the URL.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "ActiveCall"
      ADD COLUMN IF NOT EXISTS "recordingUrl"      TEXT,
      ADD COLUMN IF NOT EXISTS "recordingDuration" INTEGER,
      ADD COLUMN IF NOT EXISTS "recordingSid"      TEXT;
  `)
  await context.sequelize.query(`
    ALTER TABLE "CommProviderConfig"
      ADD COLUMN IF NOT EXISTS "enableCallRecording" BOOLEAN NOT NULL DEFAULT TRUE;
  `)
  // Backfill any rows that were inserted before this migration applied
  // (the default only governs rows created after).
  await context.sequelize.query(`
    UPDATE "CommProviderConfig" SET "enableCallRecording" = TRUE WHERE "enableCallRecording" IS NULL OR "enableCallRecording" = FALSE;
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "ActiveCall"
      DROP COLUMN IF EXISTS "recordingUrl",
      DROP COLUMN IF EXISTS "recordingDuration",
      DROP COLUMN IF EXISTS "recordingSid";
  `)
  await context.sequelize.query(`
    ALTER TABLE "CommProviderConfig"
      DROP COLUMN IF EXISTS "enableCallRecording";
  `)
}
