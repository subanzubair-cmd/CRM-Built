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
import { MESSAGE_CHANNEL_VALUES } from '../enums'

/**
 * `CampaignStep` — one step in a drip / broadcast campaign. The
 * `delayDays` + `delayHours` pair fires the step relative to the
 * enrollment timestamp.
 */
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

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare delayDays: number

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare delayHours: number

  @AllowNull(false)
  @Column(DataType.ENUM(...MESSAGE_CHANNEL_VALUES))
  declare channel: 'SMS' | 'CALL' | 'RVM' | 'EMAIL' | 'NOTE' | 'SYSTEM'

  @Column(DataType.TEXT)
  declare subject: string | null

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare body: string

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean

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
  delayDays: number
  delayHours: number
  channel: 'SMS' | 'CALL' | 'RVM' | 'EMAIL' | 'NOTE' | 'SYSTEM'
  subject: string | null
  body: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
