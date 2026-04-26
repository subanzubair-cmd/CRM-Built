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
  notes: string | null
  createdAt: Date
  updatedAt: Date
}
