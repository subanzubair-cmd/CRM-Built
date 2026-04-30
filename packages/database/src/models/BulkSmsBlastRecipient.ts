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
import {
  BULK_SMS_BLAST_RECIPIENT_STATUS_VALUES,
  BULK_SMS_BLAST_RECIPIENT_SUBJECT_TYPE_VALUES,
  type BulkSmsBlastRecipientStatus,
  type BulkSmsBlastRecipientSubjectType,
} from '../enums'
import { BulkSmsBlast } from './BulkSmsBlast'

/**
 * `BulkSmsBlastRecipient` — one row per recipient in a bulk SMS blast.
 * Polymorphic via subjectType (CONTACT / BUYER / VENDOR) so the same
 * model serves Buyers + Vendors + (future) Leads broadcasts.
 *
 * `messageId` links to the actual outbound `Message` row created by
 * the worker; it stays NULL for QUEUED rows and for SKIPPED_DND /
 * SKIPPED_INVALID rows where no Message was created.
 *
 * `providerMessageId` is the Telnyx (or Twilio) message id we get
 * back from the send call. The delivery-status webhook keys off this
 * value to flip the row from SENT to DELIVERED / FAILED.
 */
@Table({ tableName: 'BulkSmsBlastRecipient', timestamps: false })
export class BulkSmsBlastRecipient extends Model<
  Partial<BulkSmsBlastRecipientAttributes>,
  Partial<BulkSmsBlastRecipientAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => BulkSmsBlast)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare blastId: string

  @AllowNull(false)
  @Column(DataType.ENUM(...BULK_SMS_BLAST_RECIPIENT_SUBJECT_TYPE_VALUES))
  declare subjectType: BulkSmsBlastRecipientSubjectType

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare subjectId: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare phone: string

  @Column(DataType.TEXT)
  declare messageId: string | null

  @AllowNull(false)
  @Default('QUEUED')
  @Column(DataType.ENUM(...BULK_SMS_BLAST_RECIPIENT_STATUS_VALUES))
  declare status: BulkSmsBlastRecipientStatus

  @Column(DataType.TEXT) declare failReason: string | null
  @Column(DataType.TEXT) declare providerMessageId: string | null
  @Column(DataType.DATE) declare sentAt: Date | null
  @Column(DataType.DATE) declare deliveredAt: Date | null

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare updatedAt: Date
}

export interface BulkSmsBlastRecipientAttributes {
  id: string
  blastId: string
  subjectType: BulkSmsBlastRecipientSubjectType
  subjectId: string
  phone: string
  messageId: string | null
  status: BulkSmsBlastRecipientStatus
  failReason: string | null
  providerMessageId: string | null
  sentAt: Date | null
  deliveredAt: Date | null
  createdAt: Date
  updatedAt: Date
}
