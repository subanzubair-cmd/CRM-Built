/**
 * Adds the dead-reason capture columns to Property:
 *   - `deadReasons String[]`     — set of preset reason codes the user
 *                                  checked when moving the lead to DEAD.
 *   - `deadOtherReason String?`  — verbatim free-text from the "Other"
 *                                  textarea on the dead-lead modal.
 *
 * Both fields are populated on the leadStatus → DEAD transition and
 * displayed at the bottom of the lead detail page + audit-logged in
 * ActivityLog.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "Property"
      ADD COLUMN IF NOT EXISTS "deadReasons" TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "deadOtherReason" TEXT;
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "Property"
      DROP COLUMN IF EXISTS "deadReasons",
      DROP COLUMN IF EXISTS "deadOtherReason";
  `)
}
