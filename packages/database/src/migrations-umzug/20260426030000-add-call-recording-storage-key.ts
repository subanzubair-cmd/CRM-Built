/**
 * Adds `recordingStorageKey` to ActiveCall — the MinIO object key for the
 * CRM-hosted recording file (e.g. `recordings/2026-04/<callId>.mp3`).
 *
 * Architecture: when call.recording.saved fires from the provider, we
 * download the audio from the provider URL, upload to MinIO, and store the
 * MinIO key here. The CRM serves playback via /api/calls/[id]/recording
 * which generates a short-lived presigned MinIO URL — provider URLs are
 * never exposed to the browser, so the recording is fully owned by the CRM.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "ActiveCall"
      ADD COLUMN IF NOT EXISTS "recordingStorageKey" TEXT;
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "ActiveCall"
      DROP COLUMN IF EXISTS "recordingStorageKey";
  `)
}
