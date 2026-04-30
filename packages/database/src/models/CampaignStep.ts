import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  Default,
  PrimaryKey,
  ForeignKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'
import { Campaign } from './Campaign'
import {
  MESSAGE_CHANNEL_VALUES,
  CAMPAIGN_STEP_ACTION_TYPE_VALUES,
  CAMPAIGN_DELAY_UNIT_VALUES,
  type CampaignStepActionType,
  type CampaignDelayUnit,
} from '../enums'

/**
 * `CampaignStep` — one step in a drip campaign.
 *
 * Step model overview:
 *   - `actionType`            — what this step does (SMS, EMAIL, TASK,
 *                               WEBHOOK, TAG_CHANGE, STATUS_CHANGE,
 *                               DRIP_ENROLL).
 *   - `delayAmount`/`delayUnit` — when this step fires relative to
 *                                 the previous event. Unit is one of
 *                                 MINUTES / HOURS / DAYS / WEEKS /
 *                                 MONTHS.
 *   - `skipWeekendsAndHolidays` — when true, executor pushes fireAt
 *                                 to the next business day if it
 *                                 lands on Sat/Sun or a US holiday.
 *   - `config` (JSONB)        — per-actionType payload, validated at
 *                               the API boundary by a Zod
 *                               discriminated union. See
 *                               `CampaignStepConfig` in the API
 *                               schema for the per-variant shape.
 *
 * Legacy columns (`channel`, `subject`, `body`, `delayDays`,
 * `delayHours`) are kept for one version of backward compat — nothing
 * reads them once the executor switches to actionType + config. They
 * will be dropped in a follow-up migration.
 */

/** Discriminated config — mirrored at the API layer in Zod. The
 *  Sequelize model stores this as opaque JSON; the route validator
 *  is the source of truth for shape. */
export type CampaignStepConfig =
  | { actionType: 'SMS'; templateId?: string | null; body: string; recipientScope: 'PRIMARY' | 'ALL' }
  | {
      actionType: 'EMAIL'
      templateId?: string | null
      fromName: string
      fromEmail: string
      subject: string
      body: string
      attachments: Array<{ name: string; url: string }>
    }
  | {
      actionType: 'TASK'
      assigneeRoleId: string | null
      assigneeUserId: string | null
      priority: 'NONE' | 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
      title: string
      detail: string
      reminders: Array<{ via: 'SMS' | 'EMAIL'; amount: number; unit: CampaignDelayUnit }>
    }
  | { actionType: 'WEBHOOK'; url: string }
  | { actionType: 'TAG_CHANGE'; addTags: string[]; removeTags: string[] }
  | {
      actionType: 'STATUS_CHANGE'
      targetStatus: string
      pendingTaskHandling: 'COMPLETE_ALL' | 'KEEP_PENDING' | 'COMPLETE_MINE'
    }
  | { actionType: 'DRIP_ENROLL'; targetCampaignId: string }

@Table({ tableName: 'CampaignStep', timestamps: false })
export class CampaignStep extends Model<
  Partial<CampaignStepAttributes>,
  Partial<CampaignStepAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Campaign)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare campaignId: string

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare order: number

  /** New unified delay representation (replaces delayDays + delayHours). */
  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare delayAmount: number

  @AllowNull(false)
  @Default('MINUTES')
  @Column(DataType.ENUM(...CAMPAIGN_DELAY_UNIT_VALUES))
  declare delayUnit: CampaignDelayUnit

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare skipWeekendsAndHolidays: boolean

  /** What this step does + per-action config payload (JSONB). */
  @AllowNull(false)
  @Column(DataType.ENUM(...CAMPAIGN_STEP_ACTION_TYPE_VALUES))
  declare actionType: CampaignStepActionType

  @AllowNull(false)
  @Default({})
  @Column(DataType.JSONB)
  declare config: CampaignStepConfig | Record<string, unknown>

  /** Active toggle — inactive steps are skipped by the executor. */
  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean

  // ── Legacy columns (deprecated; not read by the new executor) ────
  /** @deprecated replaced by delayAmount + delayUnit */
  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare delayDays: number

  /** @deprecated replaced by delayAmount + delayUnit */
  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare delayHours: number

  /** @deprecated replaced by actionType */
  @AllowNull(false)
  @Default('SMS')
  @Column(DataType.ENUM(...MESSAGE_CHANNEL_VALUES))
  declare channel: 'SMS' | 'CALL' | 'RVM' | 'EMAIL' | 'NOTE' | 'SYSTEM'

  /** @deprecated subject moved into config (EMAIL action) */
  @Column(DataType.TEXT)
  declare subject: string | null

  /** @deprecated body moved into config (SMS / EMAIL actions) */
  @AllowNull(false)
  @Default('')
  @Column(DataType.TEXT)
  declare body: string

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface CampaignStepAttributes {
  id: string
  campaignId: string
  order: number
  delayAmount: number
  delayUnit: CampaignDelayUnit
  skipWeekendsAndHolidays: boolean
  actionType: CampaignStepActionType
  config: CampaignStepConfig | Record<string, unknown>
  isActive: boolean
  // legacy
  delayDays: number
  delayHours: number
  channel: 'SMS' | 'CALL' | 'RVM' | 'EMAIL' | 'NOTE' | 'SYSTEM'
  subject: string | null
  body: string
  createdAt: Date
  updatedAt: Date
}
