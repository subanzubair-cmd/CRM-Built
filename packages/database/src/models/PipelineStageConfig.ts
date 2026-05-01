import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  Default,
  PrimaryKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'

/**
 * `PipelineStageConfig` — stores the available stages for each pipeline.
 *
 * Each pipeline (dts_leads, dta_leads, tm, inventory, dispo) has its own
 * set of stages. Stages can be added, reordered, and soft-deleted.
 * System stages (`isSystem = true`) cannot be deleted because they have
 * backend actions wired to them (e.g. Offer Made triggers a modal,
 * Under Contract triggers routing).
 *
 * This table replaced the hardcoded ENUM constants so that users can
 * customise their pipeline via Settings > Pipeline Management.
 */
@Table({
  tableName: 'PipelineStageConfig',
  timestamps: true,
  indexes: [
    {
      name: 'idx_pipeline_stage_config_uniq',
      unique: true,
      fields: ['pipeline', 'stageCode'],
    },
    {
      name: 'idx_pipeline_stage_config_order',
      fields: ['pipeline', 'sortOrder'],
    },
  ],
})
export class PipelineStageConfig extends Model<
  Partial<PipelineStageConfigAttributes>,
  Partial<PipelineStageConfigAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  /** Pipeline identifier: dts_leads, dta_leads, tm, inventory, dispo */
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare pipeline: string

  /** Unique code within the pipeline (e.g. NEW_LEAD, UNDER_CONTRACT) */
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare stageCode: string

  /** Human-readable display label */
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare label: string

  /** Optional hex colour for visual rendering */
  @Column(DataType.TEXT)
  declare color: string | null

  /** Determines display ordering (0-based) */
  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare sortOrder: number

  /**
   * System stages cannot be deleted — they have backend logic wired
   * to them (modal triggers, routing rules, etc.).
   */
  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare isSystem: boolean

  /** Soft toggle — inactive stages are hidden from the UI but preserved. */
  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean

  @Column(DataType.DATE)
  declare createdAt: Date

  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface PipelineStageConfigAttributes {
  id: string
  pipeline: string
  stageCode: string
  label: string
  color: string | null
  sortOrder: number
  isSystem: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
