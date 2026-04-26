import {
  Table, Column, Model, DataType, AllowNull, Default, PrimaryKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'
import { WEBHOOK_EVENT_STATUS_VALUES } from '../enums'

/** Inbound webhook event log (Twilio, etc.) — append-only. */
@Table({ tableName: 'WebhookEvent', timestamps: false })
export class WebhookEvent extends Model<Partial<WebhookEventAttributes>, Partial<WebhookEventAttributes>> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string
  @AllowNull(false) @Column(DataType.TEXT) declare source: string
  @AllowNull(false) @Column(DataType.TEXT) declare eventType: string
  @AllowNull(false) @Column(DataType.JSONB) declare payload: Record<string, unknown>

  @AllowNull(false) @Default('PENDING')
  @Column(DataType.ENUM(...WEBHOOK_EVENT_STATUS_VALUES))
  declare status: 'PENDING' | 'PROCESSED' | 'FAILED'

  @Column(DataType.DATE) declare processedAt: Date | null
  @Column(DataType.TEXT) declare error: string | null

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
}

export interface WebhookEventAttributes {
  id: string
  source: string
  eventType: string
  payload: Record<string, unknown>
  status: 'PENDING' | 'PROCESSED' | 'FAILED'
  processedAt: Date | null
  error: string | null
  createdAt: Date
}
