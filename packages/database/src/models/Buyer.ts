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
import { Contact } from './Contact'

/**
 * `Buyer` — buyer profile attached 1:1 to a `Contact`. The `contactId`
 * is unique, so each contact has at most one Buyer profile.
 */
@Table({ tableName: 'Buyer', timestamps: false })
export class Buyer extends Model<
  Partial<BuyerAttributes>,
  Partial<BuyerAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Contact)
  @AllowNull(false)
  @Unique
  @Column(DataType.TEXT)
  declare contactId: string

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare preferredMarkets: string[]

  /**
   * Target geography arrays — pulled from the spec's Add Buyer form
   * fields "Target Cities / Zips / Counties / States." Stored as
   * plain text arrays + GIN-indexed via the migration so the Quick
   * Filter can do "Target Cities IS ANY OF ['Houston','Dallas']"
   * without sequential scans.
   */
  @AllowNull(false) @Default([]) @Column(DataType.ARRAY(DataType.TEXT))
  declare targetCities: string[]

  @AllowNull(false) @Default([]) @Column(DataType.ARRAY(DataType.TEXT))
  declare targetZips: string[]

  @AllowNull(false) @Default([]) @Column(DataType.ARRAY(DataType.TEXT))
  declare targetCounties: string[]

  @AllowNull(false) @Default([]) @Column(DataType.ARRAY(DataType.TEXT))
  declare targetStates: string[]

  /**
   * Answers to the admin-configurable "Buyer Preference" questions
   * authored in `CustomFormConfig(entityType='buyer')`. Shape is
   * keyed by questionId so adding/removing questions over time
   * never breaks existing rows.
   */
  @AllowNull(false) @Default({}) @Column(DataType.JSONB)
  declare customQuestions: Record<string, unknown>

  /** "VIP Buyer" — boolean used by the Quick Filter and the dashboard
   *  "VIP Buyers" stat tile. */
  @AllowNull(false) @Default(false) @Column(DataType.BOOLEAN)
  declare vipFlag: boolean

  @Column(DataType.TEXT)
  declare notes: string | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date

  // Associations populated when eager-loaded via include.
  declare contact?: Contact | null
}

export interface BuyerAttributes {
  id: string
  contactId: string
  isActive: boolean
  preferredMarkets: string[]
  targetCities: string[]
  targetZips: string[]
  targetCounties: string[]
  targetStates: string[]
  customQuestions: Record<string, unknown>
  vipFlag: boolean
  notes: string | null
  createdAt: Date
  updatedAt: Date
}
