/**
 * Extend CampaignEnrollment for the new "Auto Follow-up" activation
 * flow + the polymorphic subject (Property / Buyer / Vendor).
 *
 * Adds:
 *   - `subjectType`     — PROPERTY / BUYER / VENDOR. PROPERTY covers
 *                         Leads + Sold (both back onto Property).
 *   - `subjectId`       — text ID of the subject row. Replaces the
 *                         old propertyId column at READ time; the
 *                         column itself stays for now (deprecated)
 *                         to avoid breaking the existing executor
 *                         until it's switched over.
 *   - `phoneNumberId`   — outbound caller-ID for SMS/email steps in
 *                         this enrollment. Picked in the activation
 *                         modal via the "phone - source - name"
 *                         dropdown.
 *   - `firstStepAt`     — explicit scheduled time for step 0. When
 *                         set, the executor uses it instead of
 *                         `enrolledAt + step.delay`.
 *   - `autoStopOnReply` — when true, an inbound message/call from
 *                         the lead halts the drip.
 *   - `contactScope`    — PRIMARY (default) or ALL.
 *
 * Backfill:
 *   - subjectType = 'PROPERTY' for every existing row.
 *   - subjectId   = propertyId.
 *   - phoneNumberId / firstStepAt left NULL (legacy rows skip the new
 *     phone/timing semantics).
 *   - autoStopOnReply = false (preserves current behavior).
 *   - contactScope = 'PRIMARY' (matches what the executor does today).
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampaignEnrollmentSubjectType') THEN
        CREATE TYPE "CampaignEnrollmentSubjectType" AS ENUM (
          'PROPERTY','BUYER','VENDOR'
        );
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampaignContactScope') THEN
        CREATE TYPE "CampaignContactScope" AS ENUM ('PRIMARY','ALL');
      END IF;
    END$$;
  `)

  await context.sequelize.query(`
    ALTER TABLE "CampaignEnrollment"
      ADD COLUMN IF NOT EXISTS "subjectType"     "CampaignEnrollmentSubjectType",
      ADD COLUMN IF NOT EXISTS "subjectId"       TEXT,
      ADD COLUMN IF NOT EXISTS "phoneNumberId"   TEXT,
      ADD COLUMN IF NOT EXISTS "firstStepAt"     TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "autoStopOnReply" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "contactScope"    "CampaignContactScope" NOT NULL DEFAULT 'PRIMARY';
  `)

  // Backfill from legacy propertyId.
  await context.sequelize.query(`
    UPDATE "CampaignEnrollment"
       SET "subjectType" = 'PROPERTY'::"CampaignEnrollmentSubjectType",
           "subjectId"   = "propertyId"
     WHERE "subjectType" IS NULL OR "subjectId" IS NULL;
  `)

  await context.sequelize.query(`
    ALTER TABLE "CampaignEnrollment"
      ALTER COLUMN "subjectType" SET NOT NULL,
      ALTER COLUMN "subjectId"   SET NOT NULL;
  `)

  // New composite-unique index on (campaignId, subjectType, subjectId)
  // so a subject can be enrolled at most once per campaign regardless
  // of subject type. The legacy unique on (campaignId, propertyId)
  // stays for now (still satisfied because every legacy row has
  // subjectType=PROPERTY + subjectId=propertyId).
  await context.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CampaignEnrollment_campaignId_subject_key"
      ON "CampaignEnrollment" ("campaignId", "subjectType", "subjectId");
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    DROP INDEX IF EXISTS "CampaignEnrollment_campaignId_subject_key";
  `)
  await context.sequelize.query(`
    ALTER TABLE "CampaignEnrollment"
      DROP COLUMN IF EXISTS "subjectType",
      DROP COLUMN IF EXISTS "subjectId",
      DROP COLUMN IF EXISTS "phoneNumberId",
      DROP COLUMN IF EXISTS "firstStepAt",
      DROP COLUMN IF EXISTS "autoStopOnReply",
      DROP COLUMN IF EXISTS "contactScope";
  `)
  await context.sequelize.query(`DROP TYPE IF EXISTS "CampaignEnrollmentSubjectType";`)
  await context.sequelize.query(`DROP TYPE IF EXISTS "CampaignContactScope";`)
}
