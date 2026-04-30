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
  CAMPAIGN_ENROLLMENT_SUBJECT_TYPE_VALUES,
  CAMPAIGN_CONTACT_SCOPE_VALUES,
  type CampaignEnrollmentSubjectType,
  type CampaignContactScope,
} from '../enums'

/**
 * `CampaignEnrollment` — one row per (campaign, subject) pair.
 *
 * Polymorphic: `subjectType` is one of PROPERTY / BUYER / VENDOR and
 * `subjectId` points at the corresponding row. PROPERTY covers Leads
 * + Sold (both back onto Property under the hood). The legacy
 * `propertyId` column stays in place during the migration window —
 * for PROPERTY rows it mirrors `subjectId`, and the executor still
 * reads it. Once the executor switches over to `subjectId`, the
 * legacy column will be dropped in a follow-up migration.
 *
 * Activation extras (set by the per-lead "Auto Follow-up" modal):
 *   - `phoneNumberId`   — outbound caller-ID for SMS/email steps
 *   - `firstStepAt`     — explicit scheduled time for step 0
 *   - `autoStopOnReply` — halt drip on inbound message/call
 *   - `contactScope`    — PRIMARY (default) or ALL
 *
 * Uniqueness:
 *   - Legacy: `(campaignId, propertyId)` — kept for PROPERTY rows
 *   - New:    `(campaignId, subjectType, subjectId)` — covers all
 *             subject types
 */
@Table({
  tableName: 'CampaignEnrollment',
  timestamps: false,
  indexes: [
    {
      name: 'CampaignEnrollment_campaignId_propertyId_key',
      unique: true,
      fields: ['campaignId', 'propertyId'],
    },
    {
      name: 'CampaignEnrollment_campaignId_subject_key',
      unique: true,
      fields: ['campaignId', 'subjectType', 'subjectId'],
    },
  ],
})
export class CampaignEnrollment extends Model<
  Partial<CampaignEnrollmentAttributes>,
  Partial<CampaignEnrollmentAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Campaign)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare campaignId: string

  // ── Polymorphic subject ──
  @AllowNull(false)
  @Column(DataType.ENUM(...CAMPAIGN_ENROLLMENT_SUBJECT_TYPE_VALUES))
  declare subjectType: CampaignEnrollmentSubjectType

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare subjectId: string

  // ── Activation knobs ──
  @Column(DataType.TEXT)
  declare phoneNumberId: string | null

  @Column(DataType.DATE)
  declare firstStepAt: Date | null

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare autoStopOnReply: boolean

  @AllowNull(false)
  @Default('PRIMARY')
  @Column(DataType.ENUM(...CAMPAIGN_CONTACT_SCOPE_VALUES))
  declare contactScope: CampaignContactScope

  // ── Step / lifecycle ──
  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare currentStep: number

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean

  @Column(DataType.DATE)
  declare pausedAt: Date | null

  @Column(DataType.DATE)
  declare completedAt: Date | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare enrolledAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date

  // ── Legacy ──
  /**
   * @deprecated For PROPERTY rows this mirrors `subjectId`. Kept only
   * because the existing executor still reads it; remove once the
   * executor switches to `subjectId`.
   */
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare propertyId: string
}

export interface CampaignEnrollmentAttributes {
  id: string
  campaignId: string
  subjectType: CampaignEnrollmentSubjectType
  subjectId: string
  phoneNumberId: string | null
  firstStepAt: Date | null
  autoStopOnReply: boolean
  contactScope: CampaignContactScope
  currentStep: number
  isActive: boolean
  pausedAt: Date | null
  completedAt: Date | null
  enrolledAt: Date
  updatedAt: Date
  /** @deprecated mirrors subjectId for PROPERTY rows */
  propertyId: string
}
