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

  /**
   * Multi-phone storage for the Buyers Module spec's "+ Add Phone" UX.
   * Each entry is `{ label, number }` — label is free-form
   * ("primary" / "secondary" / "office" / "mobile") so customers can
   * organise without us baking enum values. The legacy `phone` /
   * `phone2` columns are kept (this migration backfills them into
   * phones[0] / phones[1]) so existing readers keep working.
   */
  @AllowNull(false)
  @Default([])
  @Column(DataType.JSONB)
  declare phones: Array<{ label: string; number: string }>

  /** Multi-email companion to `phones`. */
  @AllowNull(false)
  @Default([])
  @Column(DataType.JSONB)
  declare emails: Array<{ label: string; email: string }>

  /** Mailing address — distinct from address / city / state / zip
   *  because the spec's Add Buyer form uses one combined field. */
  @Column(DataType.TEXT)
  declare mailingAddress: string | null

  /** Free-text "How did you hear about us?" — stored verbatim and
   *  mirrored to a future LeadSource lookup if/when we add one. */
  @Column(DataType.TEXT)
  declare howHeardAbout: string | null

  /** "Who Owns this Buyer Contact" — soft FK to User (no cascade so
   *  contacts survive the deletion of a stale assignee). The API
   *  enforces that the assignee has the disposition role. */
  @Column(DataType.TEXT)
  declare assignedUserId: string | null

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
  phones: Array<{ label: string; number: string }>
  emails: Array<{ label: string; email: string }>
  mailingAddress: string | null
  howHeardAbout: string | null
  assignedUserId: string | null
  createdAt: Date
  updatedAt: Date
}
