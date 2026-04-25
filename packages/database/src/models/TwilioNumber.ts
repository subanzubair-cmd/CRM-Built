import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  Default,
  PrimaryKey,
  Unique,
} from 'sequelize-typescript'
import { newCuid } from './_id'

/**
 * `TwilioNumber` — provisioned outbound phone numbers (across providers
 * twilio/telnyx/signalhouse despite the legacy class name).
 *
 * Mirrors `model TwilioNumber` in `prisma/schema.prisma`.
 */
@Table({ tableName: 'TwilioNumber', timestamps: false })
export class TwilioNumber extends Model<
  Partial<TwilioNumberAttributes>,
  Partial<TwilioNumberAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Unique
  @Column(DataType.TEXT)
  declare number: string

  @Column(DataType.TEXT)
  declare friendlyName: string | null

  @Column(DataType.TEXT)
  declare marketId: string | null

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean

  @AllowNull(false)
  @Default('general')
  @Column(DataType.TEXT)
  declare purpose: string

  @Column(DataType.TEXT)
  declare spamStatus: string | null

  @Column(DataType.TEXT)
  declare tenDlcStatus: string | null

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare speedToLead: boolean

  @Column(DataType.TEXT)
  declare providerName: string | null

  @Column(DataType.TEXT)
  declare providerSid: string | null

  @Column(DataType.DATE)
  declare lastSyncedAt: Date | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date
}

export interface TwilioNumberAttributes {
  id: string
  number: string
  friendlyName: string | null
  marketId: string | null
  isActive: boolean
  purpose: string
  spamStatus: string | null
  tenDlcStatus: string | null
  speedToLead: boolean
  providerName: string | null
  providerSid: string | null
  lastSyncedAt: Date | null
  createdAt: Date
}
