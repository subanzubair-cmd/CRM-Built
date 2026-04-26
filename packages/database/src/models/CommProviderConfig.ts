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
 * `CommProviderConfig` — credentials + defaults for each communications
 * provider (twilio | telnyx | signalhouse). Secret fields inside
 * `configJson` are AES-256-GCM encrypted by the comm-provider helpers.
 */
@Table({ tableName: 'CommProviderConfig', timestamps: false })
export class CommProviderConfig extends Model<
  Partial<CommProviderConfigAttributes>,
  Partial<CommProviderConfigAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Unique
  @Column(DataType.TEXT)
  declare providerName: string

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean

  @Column(DataType.TEXT)
  declare defaultNumber: string | null

  @AllowNull(false)
  @Default({})
  @Column(DataType.JSONB)
  declare configJson: Record<string, unknown>

  /**
   * Toggle that gates per-call cost capture on inbound provider webhooks.
   * When true and the active provider supports it (currently Telnyx via
   * call.hangup payload + CDR fallback), the webhook handler writes
   * ActiveCall.cost / costCurrency. Surfaced in the call activity feed.
   */
  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare enableCallCost: boolean

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface CommProviderConfigAttributes {
  id: string
  providerName: string
  isActive: boolean
  defaultNumber: string | null
  configJson: Record<string, unknown>
  enableCallCost: boolean
  createdAt: Date
  updatedAt: Date
}
