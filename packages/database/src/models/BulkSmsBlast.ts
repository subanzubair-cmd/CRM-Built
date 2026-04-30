import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  Default,
  PrimaryKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'
import {
  BULK_SMS_BLAST_MODULE_VALUES,
  BULK_SMS_BLAST_STATUS_VALUES,
  type BulkSmsBlastModule,
  type BulkSmsBlastStatus,
} from '../enums'

/**
 * `BulkSmsBlast` — one bulk SMS broadcast composed by an operator.
 * Lives in its own table (NOT under `Campaign`) so the `/buyers` SMS
 * Campaign tab and `/drip-campaigns` don't share state.
 *
 * Counts (recipientCount/sentCount/deliveredCount/failedCount) are
 * denormalised mirrors of `BulkSmsBlastRecipient` rows, updated by
 * the worker as it drains the queue and by the Telnyx delivery
 * webhook. They power the SMS Campaign tab's column counts without
 * a JOIN-then-GROUP every page load.
 */
@Table({ tableName: 'BulkSmsBlast', timestamps: false })
export class BulkSmsBlast extends Model<
  Partial<BulkSmsBlastAttributes>,
  Partial<BulkSmsBlastAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Column(DataType.ENUM(...BULK_SMS_BLAST_MODULE_VALUES))
  declare module: BulkSmsBlastModule

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare name: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare body: string

  @Column(DataType.TEXT)
  declare fromPhoneNumberId: string | null

  @Column(DataType.TEXT)
  declare createdById: string | null

  /**
   * The SavedFilter params (or ad-hoc filter snapshot) used to choose
   * recipients. Stored so a "re-run blast against the same filter
   * today" UX is implementable without re-deriving from a SavedFilter
   * that may have been edited or deleted.
   */
  @AllowNull(false)
  @Default({})
  @Column(DataType.JSONB)
  declare recipientFilterSnapshot: Record<string, unknown>

  @AllowNull(false) @Default(0) @Column(DataType.INTEGER) declare recipientCount: number
  @AllowNull(false) @Default(0) @Column(DataType.INTEGER) declare sentCount: number
  @AllowNull(false) @Default(0) @Column(DataType.INTEGER) declare deliveredCount: number
  @AllowNull(false) @Default(0) @Column(DataType.INTEGER) declare failedCount: number

  @AllowNull(false)
  @Default('QUEUED')
  @Column(DataType.ENUM(...BULK_SMS_BLAST_STATUS_VALUES))
  declare status: BulkSmsBlastStatus

  @Column(DataType.DATE) declare scheduledAt: Date | null
  @Column(DataType.DATE) declare startedAt: Date | null
  @Column(DataType.DATE) declare completedAt: Date | null

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare updatedAt: Date
}

export interface BulkSmsBlastAttributes {
  id: string
  module: BulkSmsBlastModule
  name: string
  body: string
  fromPhoneNumberId: string | null
  createdById: string | null
  recipientFilterSnapshot: Record<string, unknown>
  recipientCount: number
  sentCount: number
  deliveredCount: number
  failedCount: number
  status: BulkSmsBlastStatus
  scheduledAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
