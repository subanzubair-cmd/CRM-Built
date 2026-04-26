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
 * `Vendor` — vendor profile attached 1:1 to a `Contact`. `category` is
 * free-form (e.g. "title-company", "contractor", "appraiser"). Cascade
 * deletes from Contact at the DB level.
 */
@Table({ tableName: 'Vendor', timestamps: false })
export class Vendor extends Model<
  Partial<VendorAttributes>,
  Partial<VendorAttributes>
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
  @Column(DataType.TEXT)
  declare category: string

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare markets: string[]

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

  // Association: populated by `include: [{ model: Contact, as: 'contact' }]`
  // (wired in `_associations.ts`). Optional because it's only present when
  // eager-loaded; null otherwise.
  declare contact?: Contact | null
}

export interface VendorAttributes {
  id: string
  contactId: string
  category: string
  isActive: boolean
  markets: string[]
  notes: string | null
  createdAt: Date
  updatedAt: Date
}
