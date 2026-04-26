import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  Default,
  PrimaryKey,
  Unique,
  ForeignKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'
import { Property } from './Property'
import { LeadCampaign } from './LeadCampaign'
import { User } from './User'

/**
 * `ActiveCall` — per-conference Twilio call record. `conferenceName` is
 * unique (we generate it); `conferenceId` is the SID Twilio assigns
 * once the conference instance exists.
 */
@Table({ tableName: 'ActiveCall', timestamps: false })
export class ActiveCall extends Model<
  Partial<ActiveCallAttributes>,
  Partial<ActiveCallAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @Unique
  @Column(DataType.TEXT)
  declare conferenceId: string | null

  @AllowNull(false)
  @Unique
  @Column(DataType.TEXT)
  declare conferenceName: string

  @Column(DataType.TEXT) declare agentCallSid: string | null
  @Column(DataType.TEXT) declare customerCallSid: string | null
  @Column(DataType.TEXT) declare supervisorCallSid: string | null

  @ForeignKey(() => Property)
  @Column(DataType.TEXT)
  declare propertyId: string | null

  @ForeignKey(() => LeadCampaign)
  @Column(DataType.TEXT)
  declare leadCampaignId: string | null

  @ForeignKey(() => User)
  @Column(DataType.TEXT)
  declare agentUserId: string | null

  @Column(DataType.TEXT) declare customerPhone: string | null

  @AllowNull(false)
  @Default('INITIATING')
  @Column(DataType.TEXT)
  declare status: string

  @Column(DataType.TEXT) declare supervisorMode: string | null

  @AllowNull(false)
  @Default('OUTBOUND')
  @Column(DataType.TEXT)
  declare direction: string

  @Column(DataType.TEXT) declare rejectedReason: string | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare startedAt: Date

  @Column(DataType.DATE) declare endedAt: Date | null

  /**
   * Per-call cost reported by the active provider. Captured only when
   * CommProviderConfig.enableCallCost is true. NUMERIC(10,4) so we can
   * hold sub-cent fractional pricing. Per-column getter returns Number
   * so the value crosses the Server→Client boundary as a primitive.
   */
  @Column({
    type: DataType.DECIMAL(10, 4),
    get(this: ActiveCall) {
      const v = this.getDataValue('cost') as unknown
      return v == null ? null : Number(v)
    },
  })
  declare cost: number | null

  @Column(DataType.TEXT)
  declare costCurrency: string | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface ActiveCallAttributes {
  id: string
  conferenceId: string | null
  conferenceName: string
  agentCallSid: string | null
  customerCallSid: string | null
  supervisorCallSid: string | null
  propertyId: string | null
  leadCampaignId: string | null
  agentUserId: string | null
  customerPhone: string | null
  status: string
  supervisorMode: string | null
  direction: string
  rejectedReason: string | null
  startedAt: Date
  endedAt: Date | null
  cost: number | null
  costCurrency: string | null
  createdAt: Date
  updatedAt: Date
}
