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

/**
 * `CampaignEnrollment` — pairs a `Property` with a `Campaign`. Each
 * lead is enrolled in at most one row per campaign (composite-unique
 * `(campaignId, propertyId)`).
 *
 * The `propertyId` column is declared as a plain TEXT here; Phase 6
 * adds the typed Property association.
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

  // FK to Property — Phase 6 adds the typed association.
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare propertyId: string

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
}

export interface CampaignEnrollmentAttributes {
  id: string
  campaignId: string
  propertyId: string
  currentStep: number
  isActive: boolean
  pausedAt: Date | null
  completedAt: Date | null
  enrolledAt: Date
  updatedAt: Date
}
