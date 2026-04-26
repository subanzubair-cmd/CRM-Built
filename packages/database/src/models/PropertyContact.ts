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
import { Contact } from './Contact'

/**
 * `PropertyContact` — join row pairing a Property with a Contact, plus
 * a per-property role label (e.g. "Primary Seller", "Co-Owner") and an
 * `isPrimary` flag (only one primary per property; enforced by app code).
 *
 * Composite-unique on (propertyId, contactId) — each contact appears at
 * most once per property.
 */
@Table({
  tableName: 'PropertyContact',
  timestamps: false,
  indexes: [
    {
      name: 'PropertyContact_propertyId_contactId_key',
      unique: true,
      fields: ['propertyId', 'contactId'],
    },
  ],
})
export class PropertyContact extends Model<
  Partial<PropertyContactAttributes>,
  Partial<PropertyContactAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Property)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare propertyId: string

  @ForeignKey(() => Contact)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare contactId: string

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare isPrimary: boolean

  @Column(DataType.TEXT)
  declare role: string | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date
}

export interface PropertyContactAttributes {
  id: string
  propertyId: string
  contactId: string
  isPrimary: boolean
  role: string | null
  createdAt: Date
}
