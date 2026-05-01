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

/**
 * `AdditionalContact` — extra contacts linked to a Buyer or Vendor
 * (e.g. Brother, Father, Friend). Uses polymorphic columns
 * (`subjectType` + `subjectId`) so one table serves both entity types.
 */
@Table({ tableName: 'AdditionalContact', timestamps: false })
export class AdditionalContact extends Model<
  Partial<AdditionalContactAttributes>,
  Partial<AdditionalContactAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  /** 'BUYER' or 'VENDOR' — the owning entity type. */
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare subjectType: 'BUYER' | 'VENDOR'

  /** The owning Buyer.id or Vendor.id. */
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare subjectId: string

  /** Relationship label — e.g. Brother, Father, Friend, Attorney. */
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare relationship: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare firstName: string

  @Column(DataType.TEXT)
  declare lastName: string | null

  @Column(DataType.TEXT)
  declare phone: string | null

  @Column(DataType.TEXT)
  declare email: string | null

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
}

export interface AdditionalContactAttributes {
  id: string
  subjectType: 'BUYER' | 'VENDOR'
  subjectId: string
  relationship: string
  firstName: string
  lastName: string | null
  phone: string | null
  email: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}
