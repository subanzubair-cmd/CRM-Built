import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

/**
 * Adds INQUIRIES dispo stage and renames COLD_BUYER label to "Cold Buyers".
 * Also shifts sort orders of WARM/HOT/OFFER/SOLD to accommodate the new stage.
 */
export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  const sq = context.sequelize

  // Rename "Cold Buyer" → "Cold Buyers"
  await sq.query(
    `UPDATE "PipelineStageConfig"
     SET label = 'Cold Buyers', "updatedAt" = NOW()
     WHERE pipeline = 'dispo' AND "stageCode" = 'COLD_BUYER'`,
  )

  // Shift existing stages up to make room for INQUIRIES at sortOrder 2
  await sq.query(
    `UPDATE "PipelineStageConfig"
     SET "sortOrder" = "sortOrder" + 1, "updatedAt" = NOW()
     WHERE pipeline = 'dispo' AND "sortOrder" >= 2`,
  )

  // Insert INQUIRIES (or update label if already exists)
  await sq.query(
    `INSERT INTO "PipelineStageConfig"
       (id, pipeline, "stageCode", label, "sortOrder", "isSystem", "isActive", "createdAt", "updatedAt")
     VALUES
       (gen_random_uuid()::text, 'dispo', 'INQUIRIES', 'Inquiries', 2, false, true, NOW(), NOW())
     ON CONFLICT (pipeline, "stageCode")
     DO UPDATE SET label = 'Inquiries', "sortOrder" = 2, "updatedAt" = NOW()`,
  )
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  const sq = context.sequelize

  // Remove INQUIRIES
  await sq.query(
    `DELETE FROM "PipelineStageConfig" WHERE pipeline = 'dispo' AND "stageCode" = 'INQUIRIES'`,
  )

  // Shift stages back down
  await sq.query(
    `UPDATE "PipelineStageConfig"
     SET "sortOrder" = "sortOrder" - 1, "updatedAt" = NOW()
     WHERE pipeline = 'dispo' AND "sortOrder" > 2`,
  )

  // Rename back
  await sq.query(
    `UPDATE "PipelineStageConfig"
     SET label = 'Cold Buyer', "updatedAt" = NOW()
     WHERE pipeline = 'dispo' AND "stageCode" = 'COLD_BUYER'`,
  )
}
