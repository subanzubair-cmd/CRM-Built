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
import { Property } from './Property'
import { Conversation } from './Conversation'
import { User } from './User'
import { Contact } from './Contact'
import { LeadCampaign } from './LeadCampaign'
import { MESSAGE_CHANNEL_VALUES, MESSAGE_DIRECTION_VALUES } from '../enums'

/**
 * `Message` — individual SMS / call / email / RVM / note / system event.
 * Most messages belong to a `Conversation`, but ad-hoc broadcasts may
 * have only `propertyId`. AI-generated messages are flagged for
 * human review.
 */
@Table({ tableName: 'Message', timestamps: false })
export class Message extends Model<
  Partial<MessageAttributes>,
  Partial<MessageAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Property)
  @Column(DataType.TEXT)
  declare propertyId: string | null

  @ForeignKey(() => Conversation)
  @Column(DataType.TEXT)
  declare conversationId: string | null

  @AllowNull(false)
  @Column(DataType.ENUM(...MESSAGE_CHANNEL_VALUES))
  declare channel: 'SMS' | 'CALL' | 'RVM' | 'EMAIL' | 'NOTE' | 'SYSTEM'

  @AllowNull(false)
  @Column(DataType.ENUM(...MESSAGE_DIRECTION_VALUES))
  declare direction: 'INBOUND' | 'OUTBOUND'

  @Column(DataType.TEXT) declare body: string | null
  @Column(DataType.TEXT) declare subject: string | null
  @Column(DataType.TEXT) declare from: string | null
  @Column(DataType.TEXT) declare to: string | null

  @ForeignKey(() => User)
  @Column(DataType.TEXT)
  declare sentById: string | null

  @Column(DataType.TEXT) declare twilioSid: string | null
  @Column(DataType.TEXT) declare emailMessageId: string | null

  @AllowNull(false) @Default(false) @Column(DataType.BOOLEAN) declare isAiGenerated: boolean
  @AllowNull(false) @Default(false) @Column(DataType.BOOLEAN) declare aiReviewed: boolean

  @Column(DataType.DATE) declare readAt: Date | null
  @Column(DataType.DATE) declare deliveredAt: Date | null
  @Column(DataType.DATE) declare failedAt: Date | null
  @Column(DataType.TEXT) declare failReason: string | null
  @Column(DataType.TEXT) declare callOutcome: string | null
  @Column(DataType.INTEGER) declare durationSeconds: number | null

  @ForeignKey(() => Contact)
  @Column(DataType.TEXT)
  declare contactId: string | null

  @ForeignKey(() => LeadCampaign)
  @Column(DataType.TEXT)
  declare leadCampaignId: string | null

  @Column(DataType.TEXT) declare status: string | null
  @Column(DataType.TEXT) declare recordingUrl: string | null
  @Column(DataType.TEXT) declare aiSummaryText: string | null

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare attachmentUrls: string[]

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date
}

export interface MessageAttributes {
  id: string
  propertyId: string | null
  conversationId: string | null
  channel: 'SMS' | 'CALL' | 'RVM' | 'EMAIL' | 'NOTE' | 'SYSTEM'
  direction: 'INBOUND' | 'OUTBOUND'
  body: string | null
  subject: string | null
  from: string | null
  to: string | null
  sentById: string | null
  twilioSid: string | null
  emailMessageId: string | null
  isAiGenerated: boolean
  aiReviewed: boolean
  readAt: Date | null
  deliveredAt: Date | null
  failedAt: Date | null
  failReason: string | null
  callOutcome: string | null
  durationSeconds: number | null
  contactId: string | null
  leadCampaignId: string | null
  status: string | null
  recordingUrl: string | null
  aiSummaryText: string | null
  attachmentUrls: string[]
  createdAt: Date
}
