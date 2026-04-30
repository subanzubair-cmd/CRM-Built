/**
 * Extend Contact + Buyer to match the Buyers Module spec.
 *
 * Contact:
 *   - phones JSONB: array of {label,number} so the form's "+ Add Phone"
 *     UX maps to a single column instead of phone1/phone2/phone3...
 *   - emails JSONB: same shape, matches "+ Add Email."
 *   - mailingAddress: separate from address/city/state/zip because the
 *     spec puts mailing on its own field for buyers.
 *   - howHeardAbout: free-text marketing channel attribution.
 *   - assignedUserId: "Who Owns this Buyer Contact" — must be a
 *     disposition-role user; enforced at the API layer, not the DB.
 *
 * Buyer:
 *   - target geography arrays (cities/zips/counties/states)
 *   - customQuestions JSONB: holds answers to admin-configurable
 *     questions (kind of properties, exit strategies, deals/year,
 *     proof of funds, etc.) — schema authored in CustomFormConfig.
 *   - vipFlag: explicit boolean for the spec's "VIP Buyer" filter.
 *
 * Backfill:
 *   - phones[0] = {label:'primary', number:phone} when phone is set.
 *   - phones[1] = {label:'secondary', number:phone2} when phone2 is set.
 *   - emails[0] = {label:'primary', email:email} when email is set.
 *   The legacy single-value columns stay (the model exposes them as
 *   getters that read [0] of the new arrays) so existing callers
 *   keep working until they're migrated.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "Contact"
      ADD COLUMN IF NOT EXISTS "phones" JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "emails" JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "mailingAddress" TEXT,
      ADD COLUMN IF NOT EXISTS "howHeardAbout" TEXT,
      ADD COLUMN IF NOT EXISTS "assignedUserId" TEXT;
  `)

  // Backfill phones from phone + phone2.
  await context.sequelize.query(`
    UPDATE "Contact"
       SET "phones" = COALESCE("phones", '[]'::jsonb) ||
         CASE WHEN "phone" IS NOT NULL AND "phone" <> ''
              THEN jsonb_build_array(jsonb_build_object('label','primary','number',"phone"))
              ELSE '[]'::jsonb END ||
         CASE WHEN "phone2" IS NOT NULL AND "phone2" <> ''
              THEN jsonb_build_array(jsonb_build_object('label','secondary','number',"phone2"))
              ELSE '[]'::jsonb END
     WHERE jsonb_array_length(COALESCE("phones", '[]'::jsonb)) = 0;
  `)

  // Backfill emails from email.
  await context.sequelize.query(`
    UPDATE "Contact"
       SET "emails" = COALESCE("emails", '[]'::jsonb) ||
         CASE WHEN "email" IS NOT NULL AND "email" <> ''
              THEN jsonb_build_array(jsonb_build_object('label','primary','email',"email"))
              ELSE '[]'::jsonb END
     WHERE jsonb_array_length(COALESCE("emails", '[]'::jsonb)) = 0;
  `)

  // Soft FK to User — no constraint, validated at the API layer (the
  // assignedUserId can become orphaned if a user is deleted; we'd
  // rather that than a destructive cascade delete).
  await context.sequelize.query(`
    CREATE INDEX IF NOT EXISTS "Contact_assignedUserId_idx"
      ON "Contact" ("assignedUserId");
  `)

  // Buyer extensions
  await context.sequelize.query(`
    ALTER TABLE "Buyer"
      ADD COLUMN IF NOT EXISTS "targetCities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS "targetZips" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS "targetCounties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS "targetStates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS "customQuestions" JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS "vipFlag" BOOLEAN NOT NULL DEFAULT false;
  `)

  // GIN indexes on the geography arrays speed up the Quick Filter
  // "Target Cities IS ('Houston','Dallas')" query — without these
  // each filter would do a sequential scan of every Buyer.
  await context.sequelize.query(`
    CREATE INDEX IF NOT EXISTS "Buyer_targetCities_gin"   ON "Buyer" USING GIN ("targetCities");
    CREATE INDEX IF NOT EXISTS "Buyer_targetZips_gin"     ON "Buyer" USING GIN ("targetZips");
    CREATE INDEX IF NOT EXISTS "Buyer_targetCounties_gin" ON "Buyer" USING GIN ("targetCounties");
    CREATE INDEX IF NOT EXISTS "Buyer_targetStates_gin"   ON "Buyer" USING GIN ("targetStates");
    CREATE INDEX IF NOT EXISTS "Buyer_vipFlag_idx"        ON "Buyer" ("vipFlag") WHERE "vipFlag" = TRUE;
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    DROP INDEX IF EXISTS "Buyer_targetCities_gin";
    DROP INDEX IF EXISTS "Buyer_targetZips_gin";
    DROP INDEX IF EXISTS "Buyer_targetCounties_gin";
    DROP INDEX IF EXISTS "Buyer_targetStates_gin";
    DROP INDEX IF EXISTS "Buyer_vipFlag_idx";
    ALTER TABLE "Buyer"
      DROP COLUMN IF EXISTS "targetCities",
      DROP COLUMN IF EXISTS "targetZips",
      DROP COLUMN IF EXISTS "targetCounties",
      DROP COLUMN IF EXISTS "targetStates",
      DROP COLUMN IF EXISTS "customQuestions",
      DROP COLUMN IF EXISTS "vipFlag";
  `)
  await context.sequelize.query(`
    DROP INDEX IF EXISTS "Contact_assignedUserId_idx";
    ALTER TABLE "Contact"
      DROP COLUMN IF EXISTS "phones",
      DROP COLUMN IF EXISTS "emails",
      DROP COLUMN IF EXISTS "mailingAddress",
      DROP COLUMN IF EXISTS "howHeardAbout",
      DROP COLUMN IF EXISTS "assignedUserId";
  `)
}
