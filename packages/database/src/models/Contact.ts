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
import { CONTACT_TYPE_VALUES } from '../enums'

/**
 * `Contact` — universal person/organization record. Linked to Properties
 * via `PropertyContact` (Phase 6) and to one or zero Buyer / Vendor
 * profiles (1:1 reverse). DNC fields apply per-channel.
 */
@Table({ tableName: 'Contact', timestamps: false })
export class Contact extends Model<
  Partial<ContactAttributes>,
  Partial<ContactAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Column(DataType.ENUM(...CONTACT_TYPE_VALUES))
  declare type: 'SELLER' | 'BUYER' | 'AGENT' | 'VENDOR' | 'OTHER'

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare firstName: string

  @Column(DataType.TEXT)
  declare lastName: string | null

  @Column(DataType.TEXT)
  declare email: string | null

  @Column(DataType.TEXT)
  declare phone: string | null

  @Column(DataType.TEXT)
  declare phone2: string | null

  @Column(DataType.TEXT)
  declare address: string | null

  @Column(DataType.TEXT)
  declare city: string | null

  @Column(DataType.TEXT)
  declare state: string | null

  @Column(DataType.TEXT)
  declare zip: string | null

  @Column(DataType.TEXT)
  declare notes: string | null

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare tags: string[]

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare doNotCall: boolean

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare doNotText: boolean

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare doNotEmail: boolean

  @Column(DataType.TEXT)
  declare preferredChannel: string | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface ContactAttributes {
  id: string
  type: 'SELLER' | 'BUYER' | 'AGENT' | 'VENDOR' | 'OTHER'
  firstName: string
  lastName: string | null
  email: string | null
  phone: string | null
  phone2: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
  tags: string[]
  doNotCall: boolean
  doNotText: boolean
  doNotEmail: boolean
  preferredChannel: string | null
  createdAt: Date
  updatedAt: Date
}
