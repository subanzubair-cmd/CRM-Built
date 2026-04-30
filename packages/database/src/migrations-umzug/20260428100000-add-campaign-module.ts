/**
 * Add `module` to Campaign — single-select target for a drip campaign.
 *
 * REsimpli's authoring modal lets the operator pick exactly ONE of
 * `Leads / Buyers / Vendors / Sold` per campaign. The status-option
 * list, the polymorphic CampaignEnrollment subjectType, and which
 * leads can be enrolled at activation time all key off this column.
 *
 * Existing campaigns predate the field — we backfill from the legacy
 * `leadTypes[]` column:
 *   - any leadTypes value present  → 'LEADS' (DTS / DTA both bucket
 *                                    under LEADS module — the existing
 *                                    drip rows were lead-targeted)
 *   - leadTypes empty              → 'LEADS' (defensive default)
 *
 * `leadTypes` stays in place for now (deprecated, no readers planned)
 * so a downgrade path exists. Phase B+ deletes it once the UI no
 * longer references it.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'CampaignModule'
      ) THEN
        CREATE TYPE "CampaignModule" AS ENUM ('LEADS','BUYERS','VENDORS','SOLD');
      END IF;
    END$$;
  `)

  await context.sequelize.query(`
    ALTER TABLE "Campaign"
      ADD COLUMN IF NOT EXISTS "module" "CampaignModule";
  `)

  // Backfill: legacy rows are all lead-targeted.
  await context.sequelize.query(`
    UPDATE "Campaign" SET "module" = 'LEADS' WHERE "module" IS NULL;
  `)

  await context.sequelize.query(`
    ALTER TABLE "Campaign"
      ALTER COLUMN "module" SET NOT NULL,
      ALTER COLUMN "module" SET DEFAULT 'LEADS';
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "Campaign" DROP COLUMN IF EXISTS "module";
  `)
  await context.sequelize.query(`
    DROP TYPE IF EXISTS "CampaignModule";
  `)
}
