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
import { Market } from './Market'
import {
  CAMPAIGN_TYPE_VALUES,
  CAMPAIGN_STATUS_VALUES,
  LEAD_TYPE_VALUES,
} from '../enums'

/**
 * `Campaign` — drip / broadcast outreach campaigns. Distinct from
 * `LeadCampaign` (which is the inbound lead-attribution container).
 *
 * `leadTypes` is a Postgres ARRAY of LeadType enum values — declared
 * as ARRAY(TEXT) here to dodge sequelize-typescript's enum-array gap.
 * Postgres still enforces the values at the DB level via the original
 * column definition (`leadTypes "LeadType"[]` in init.sql).
 */
@Table({ tableName: 'Campaign', timestamps: false })
export class Campaign extends Model<
  Partial<CampaignAttributes>,
  Partial<CampaignAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare name: string

  @AllowNull(false)
  @Column(DataType.ENUM(...CAMPAIGN_TYPE_VALUES))
  declare type: 'DRIP' | 'BROADCAST'

  @AllowNull(false)
  @Default('DRAFT')
  @Column(DataType.ENUM(...CAMPAIGN_STATUS_VALUES))
  declare status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'

  @Column(DataType.TEXT)
  declare description: string | null

  @ForeignKey(() => Market)
  @Column(DataType.TEXT)
  declare marketId: string | null

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare tags: string[]

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.ENUM(...LEAD_TYPE_VALUES)))
  declare leadTypes: Array<'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'>

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare aiEnabled: boolean

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface CampaignAttributes {
  id: string
  name: string
  type: 'DRIP' | 'BROADCAST'
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  description: string | null
  marketId: string | null
  tags: string[]
  leadTypes: Array<'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'>
  aiEnabled: boolean
  createdAt: Date
  updatedAt: Date
}
