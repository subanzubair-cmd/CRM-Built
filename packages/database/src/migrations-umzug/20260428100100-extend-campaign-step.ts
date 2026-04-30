/**
 * Extend CampaignStep for the multi-action drip authoring flow.
 *
 * Adds:
 *   - `actionType`              — what this step does (SMS, EMAIL, TASK,
 *                                  WEBHOOK, TAG_CHANGE, STATUS_CHANGE,
 *                                  DRIP_ENROLL). Replaces the old
 *                                  `channel` semantics — a step is no
 *                                  longer just a message; it can be
 *                                  any drip-driven side effect.
 *   - `delayAmount` / `delayUnit` — replaces (delayDays, delayHours)
 *                                  with a (number, unit) pair so we
 *                                  can express minutes / hours / days
 *                                  / weeks / months without overflow
 *                                  shenanigans.
 *   - `skipWeekendsAndHolidays` — single checkbox in the spec UI;
 *                                  executor pushes fireAt to next
 *                                  business day when true.
 *   - `config` (JSONB)          — per-actionType payload. Discriminated
 *                                  union; see `CampaignStepActionType`
 *                                  in enums.ts and the route-layer
 *                                  Zod schema for the per-variant
 *                                  shape.
 *
 * Strategy:
 *   - Old columns (`channel`, `subject`, `body`, `delayDays`,
 *     `delayHours`) stay in place for one-version backward compat.
 *     Backfill the new columns from them on the way up; nothing
 *     reads the old columns once the executor switches over.
 *   - DRIP / SMS rows backfill to `actionType='SMS'`, EMAIL → 'EMAIL',
 *     CALL/RVM/NOTE/SYSTEM → 'SMS' (defensive default — those legacy
 *     rows weren't meaningfully used in the existing executor).
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  // Postgres enum types — create if missing.
  await context.sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampaignStepActionType') THEN
        CREATE TYPE "CampaignStepActionType" AS ENUM (
          'SMS','EMAIL','TASK','WEBHOOK','TAG_CHANGE','STATUS_CHANGE','DRIP_ENROLL'
        );
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampaignDelayUnit') THEN
        CREATE TYPE "CampaignDelayUnit" AS ENUM (
          'MINUTES','HOURS','DAYS','WEEKS','MONTHS'
        );
      END IF;
    END$$;
  `)

  // New columns — nullable initially so we can backfill before NOT NULL.
  await context.sequelize.query(`
    ALTER TABLE "CampaignStep"
      ADD COLUMN IF NOT EXISTS "actionType"   "CampaignStepActionType",
      ADD COLUMN IF NOT EXISTS "delayAmount"  INTEGER,
      ADD COLUMN IF NOT EXISTS "delayUnit"    "CampaignDelayUnit",
      ADD COLUMN IF NOT EXISTS "skipWeekendsAndHolidays" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "config"       JSONB NOT NULL DEFAULT '{}'::jsonb;
  `)

  // Backfill actionType from legacy `channel`. EMAIL stays EMAIL;
  // everything else collapses to SMS (those legacy channel values
  // weren't actually executed for non-message types).
  await context.sequelize.query(`
    UPDATE "CampaignStep"
       SET "actionType" = CASE
         WHEN "channel" = 'EMAIL' THEN 'EMAIL'::"CampaignStepActionType"
         ELSE 'SMS'::"CampaignStepActionType"
       END
     WHERE "actionType" IS NULL;
  `)

  // Backfill delayAmount + delayUnit from legacy delayDays/delayHours.
  // Prefer hours when delayDays=0 to keep precision; otherwise pick
  // days. Anything zeroed defaults to 0 minutes (immediate).
  await context.sequelize.query(`
    UPDATE "CampaignStep"
       SET "delayAmount" = CASE
             WHEN COALESCE("delayDays", 0) > 0 THEN "delayDays"
             ELSE COALESCE("delayHours", 0)
           END,
           "delayUnit" = CASE
             WHEN COALESCE("delayDays", 0) > 0 THEN 'DAYS'::"CampaignDelayUnit"
             WHEN COALESCE("delayHours", 0) > 0 THEN 'HOURS'::"CampaignDelayUnit"
             ELSE 'MINUTES'::"CampaignDelayUnit"
           END
     WHERE "delayAmount" IS NULL OR "delayUnit" IS NULL;
  `)

  // Backfill `config` for legacy SMS/EMAIL rows so the executor can
  // read the new shape uniformly.
  //   SMS   → { body, recipientScope: 'PRIMARY' }
  //   EMAIL → { subject, body, recipientScope: 'PRIMARY' }
  await context.sequelize.query(`
    UPDATE "CampaignStep"
       SET "config" = jsonb_build_object(
             'body', COALESCE("body", ''),
             'recipientScope', 'PRIMARY'
           )
     WHERE "actionType" = 'SMS' AND ("config" IS NULL OR "config" = '{}'::jsonb);
  `)
  await context.sequelize.query(`
    UPDATE "CampaignStep"
       SET "config" = jsonb_build_object(
             'subject', COALESCE("subject", ''),
             'body', COALESCE("body", ''),
             'recipientScope', 'PRIMARY'
           )
     WHERE "actionType" = 'EMAIL' AND ("config" IS NULL OR "config" = '{}'::jsonb);
  `)

  // Lock down NOT NULL on the new columns now that backfill is done.
  await context.sequelize.query(`
    ALTER TABLE "CampaignStep"
      ALTER COLUMN "actionType"  SET NOT NULL,
      ALTER COLUMN "delayAmount" SET NOT NULL,
      ALTER COLUMN "delayUnit"   SET NOT NULL;
  `)
  await context.sequelize.query(`
    ALTER TABLE "CampaignStep"
      ALTER COLUMN "delayAmount" SET DEFAULT 0,
      ALTER COLUMN "delayUnit"   SET DEFAULT 'MINUTES'::"CampaignDelayUnit";
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "CampaignStep"
      DROP COLUMN IF EXISTS "actionType",
      DROP COLUMN IF EXISTS "delayAmount",
      DROP COLUMN IF EXISTS "delayUnit",
      DROP COLUMN IF EXISTS "skipWeekendsAndHolidays",
      DROP COLUMN IF EXISTS "config";
  `)
  // Drop enum types AFTER columns referencing them are gone.
  await context.sequelize.query(`DROP TYPE IF EXISTS "CampaignStepActionType";`)
  await context.sequelize.query(`DROP TYPE IF EXISTS "CampaignDelayUnit";`)
}
