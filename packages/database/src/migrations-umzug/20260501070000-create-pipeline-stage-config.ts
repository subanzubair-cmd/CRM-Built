import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'
import { Sequelize } from 'sequelize'

/**
 * Creates the PipelineStageConfig table and seeds it with the existing
 * hardcoded stage definitions. Also converts the Property stage columns
 * and BuyerMatch.dispoStage from ENUM to TEXT so that custom stages
 * can be stored without ALTER TYPE gymnastics.
 */
export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  const sq = context.sequelize

  // ── 1. Create PipelineStageConfig table ─────────────────────────────────
  await context.createTable('PipelineStageConfig', {
    id: {
      type: 'TEXT',
      primaryKey: true,
      allowNull: false,
    },
    pipeline: {
      type: 'TEXT',
      allowNull: false,
    },
    stageCode: {
      type: 'TEXT',
      allowNull: false,
    },
    label: {
      type: 'TEXT',
      allowNull: false,
    },
    color: {
      type: 'TEXT',
      allowNull: true,
    },
    sortOrder: {
      type: 'INTEGER',
      allowNull: false,
      defaultValue: 0,
    },
    isSystem: {
      type: 'BOOLEAN',
      allowNull: false,
      defaultValue: false,
    },
    isActive: {
      type: 'BOOLEAN',
      allowNull: false,
      defaultValue: true,
    },
    createdAt: {
      type: 'TIMESTAMP WITH TIME ZONE',
      allowNull: false,
      defaultValue: Sequelize.fn('NOW'),
    },
    updatedAt: {
      type: 'TIMESTAMP WITH TIME ZONE',
      allowNull: false,
      defaultValue: Sequelize.fn('NOW'),
    },
  })

  await context.addIndex('PipelineStageConfig', ['pipeline', 'stageCode'], {
    name: 'idx_pipeline_stage_config_uniq',
    unique: true,
  })

  await context.addIndex('PipelineStageConfig', ['pipeline', 'sortOrder'], {
    name: 'idx_pipeline_stage_config_order',
  })

  // ── 2. Convert ENUM columns to TEXT ─────────────────────────────────────
  // Property columns
  await sq.query(`ALTER TABLE "Property" ALTER COLUMN "activeLeadStage" TYPE TEXT`)
  await sq.query(`ALTER TABLE "Property" ALTER COLUMN "tmStage" TYPE TEXT`)
  await sq.query(`ALTER TABLE "Property" ALTER COLUMN "inventoryStage" TYPE TEXT`)

  // BuyerMatch.dispoStage
  await sq.query(`ALTER TABLE "BuyerMatch" ALTER COLUMN "dispoStage" TYPE TEXT`)

  // Drop the old enum types (safe — no columns reference them anymore)
  await sq.query(`DROP TYPE IF EXISTS "enum_Property_activeLeadStage"`)
  await sq.query(`DROP TYPE IF EXISTS "enum_Property_tmStage"`)
  await sq.query(`DROP TYPE IF EXISTS "enum_Property_inventoryStage"`)
  await sq.query(`DROP TYPE IF EXISTS "enum_BuyerMatch_dispoStage"`)

  // ── 3. Seed default stages ──────────────────────────────────────────────
  const stages = [
    // DTS Leads
    { pipeline: 'dts_leads', code: 'NEW_LEAD', label: 'New Lead', order: 0, system: true },
    { pipeline: 'dts_leads', code: 'DISCOVERY', label: 'Discovery', order: 1, system: false },
    { pipeline: 'dts_leads', code: 'INTERESTED_ADD_TO_FOLLOW_UP', label: 'Interested / Follow Up', order: 2, system: false },
    { pipeline: 'dts_leads', code: 'APPOINTMENT_MADE', label: 'Appointment Made', order: 3, system: false },
    { pipeline: 'dts_leads', code: 'DUE_DILIGENCE', label: 'Due Diligence', order: 4, system: false },
    { pipeline: 'dts_leads', code: 'OFFER_MADE', label: 'Offer Made', order: 5, system: true },
    { pipeline: 'dts_leads', code: 'OFFER_FOLLOW_UP', label: 'Offer Follow Up', order: 6, system: false },
    { pipeline: 'dts_leads', code: 'UNDER_CONTRACT', label: 'Under Contract', order: 7, system: true },

    // DTA Leads
    { pipeline: 'dta_leads', code: 'NEW_LEAD', label: 'New Lead', order: 0, system: true },
    { pipeline: 'dta_leads', code: 'DISCOVERY', label: 'Discovery', order: 1, system: false },
    { pipeline: 'dta_leads', code: 'INTERESTED_ADD_TO_FOLLOW_UP', label: 'Interested / Follow Up', order: 2, system: false },
    { pipeline: 'dta_leads', code: 'DUE_DILIGENCE', label: 'Due Diligence', order: 3, system: false },
    { pipeline: 'dta_leads', code: 'OFFER_MADE', label: 'Offer Made', order: 4, system: true },
    { pipeline: 'dta_leads', code: 'OFFER_FOLLOW_UP', label: 'Offer Follow Up', order: 5, system: false },
    { pipeline: 'dta_leads', code: 'UNDER_CONTRACT', label: 'Under Contract', order: 6, system: true },

    // Transaction Management
    { pipeline: 'tm', code: 'NEW_CONTRACT', label: 'New Contract', order: 0, system: true },
    { pipeline: 'tm', code: 'MARKETING_TO_BUYERS', label: 'Marketing to Buyers', order: 1, system: false },
    { pipeline: 'tm', code: 'SHOWING_TO_BUYERS', label: 'Showing to Buyers', order: 2, system: false },
    { pipeline: 'tm', code: 'EVALUATING_OFFERS', label: 'Evaluating Offers', order: 3, system: false },
    { pipeline: 'tm', code: 'ACCEPTED_OFFER', label: 'Accepted Offer', order: 4, system: true },
    { pipeline: 'tm', code: 'CLEAR_TO_CLOSE', label: 'Clear to Close', order: 5, system: true },

    // Inventory
    { pipeline: 'inventory', code: 'NEW_INVENTORY', label: 'New Inventory', order: 0, system: true },
    { pipeline: 'inventory', code: 'GETTING_ESTIMATES', label: 'Getting Estimates', order: 1, system: false },
    { pipeline: 'inventory', code: 'UNDER_REHAB', label: 'Under Rehab', order: 2, system: false },
    { pipeline: 'inventory', code: 'LISTED_FOR_SALE', label: 'Listed for Sale', order: 3, system: false },
    { pipeline: 'inventory', code: 'UNDER_CONTRACT', label: 'Under Contract', order: 4, system: true },

    // Dispo
    { pipeline: 'dispo', code: 'POTENTIAL_BUYER', label: 'Potential Buyer', order: 0, system: true },
    { pipeline: 'dispo', code: 'COLD_BUYER', label: 'Cold Buyer', order: 1, system: false },
    { pipeline: 'dispo', code: 'WARM_BUYER', label: 'Warm Buyer', order: 2, system: false },
    { pipeline: 'dispo', code: 'HOT_BUYER', label: 'Hot Buyer', order: 3, system: false },
    { pipeline: 'dispo', code: 'DISPO_OFFER_RECEIVED', label: 'Offer Received', order: 4, system: true },
    { pipeline: 'dispo', code: 'SOLD', label: 'Sold', order: 5, system: true },
  ]

  for (const s of stages) {
    await sq.query(
      `INSERT INTO "PipelineStageConfig" (id, pipeline, "stageCode", label, "sortOrder", "isSystem", "isActive", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, :pipeline, :code, :label, :sortOrder, :isSystem, true, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      {
        replacements: {
          pipeline: s.pipeline,
          code: s.code,
          label: s.label,
          sortOrder: s.order,
          isSystem: s.system,
        },
      },
    )
  }
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  const sq = context.sequelize

  // Re-create enum types (values must match the originals)
  await sq.query(`
    CREATE TYPE "enum_Property_activeLeadStage" AS ENUM (
      'NEW_LEAD','DISCOVERY','INTERESTED_ADD_TO_FOLLOW_UP','VETTED_AGENTS',
      'APPOINTMENT_MADE','DUE_DILIGENCE','OFFER_MADE','OFFER_FOLLOW_UP','UNDER_CONTRACT'
    )
  `)
  await sq.query(`
    CREATE TYPE "enum_Property_tmStage" AS ENUM (
      'NEW_CONTRACT','MARKETING_TO_BUYERS','SHOWING_TO_BUYERS',
      'EVALUATING_OFFERS','ACCEPTED_OFFER','CLEAR_TO_CLOSE'
    )
  `)
  await sq.query(`
    CREATE TYPE "enum_Property_inventoryStage" AS ENUM (
      'NEW_INVENTORY','GETTING_ESTIMATES','UNDER_REHAB','LISTED_FOR_SALE','UNDER_CONTRACT'
    )
  `)
  await sq.query(`
    CREATE TYPE "enum_BuyerMatch_dispoStage" AS ENUM (
      'POTENTIAL_BUYER','COLD_BUYER','WARM_BUYER','HOT_BUYER','DISPO_OFFER_RECEIVED','SOLD'
    )
  `)

  // Convert columns back to ENUM
  await sq.query(`ALTER TABLE "Property" ALTER COLUMN "activeLeadStage" TYPE "enum_Property_activeLeadStage" USING "activeLeadStage"::"enum_Property_activeLeadStage"`)
  await sq.query(`ALTER TABLE "Property" ALTER COLUMN "tmStage" TYPE "enum_Property_tmStage" USING "tmStage"::"enum_Property_tmStage"`)
  await sq.query(`ALTER TABLE "Property" ALTER COLUMN "inventoryStage" TYPE "enum_Property_inventoryStage" USING "inventoryStage"::"enum_Property_inventoryStage"`)
  await sq.query(`ALTER TABLE "BuyerMatch" ALTER COLUMN "dispoStage" TYPE "enum_BuyerMatch_dispoStage" USING "dispoStage"::"enum_BuyerMatch_dispoStage"`)

  await context.dropTable('PipelineStageConfig')
}
