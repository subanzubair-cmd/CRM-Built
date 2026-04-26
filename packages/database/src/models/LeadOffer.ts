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

/**
 * `LeadOffer` — our offer to the seller (or seller's counter). Distinct
 * from `BuyerOffer` (buyer's offer to us). Used during DTS / DTA flows.
 */
@Table({
  tableName: 'LeadOffer',
  timestamps: false,
  indexes: [{ name: 'LeadOffer_propertyId_idx', fields: ['propertyId'] }],
})
export class LeadOffer extends Model<
  Partial<LeadOfferAttributes>,
  Partial<LeadOfferAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Property)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare propertyId: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare offerBy: string

  @AllowNull(false)
  @Column(DataType.DATE)
  declare offerDate: Date

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare offerType: string

  @AllowNull(false)
  @Column({
    type: DataType.DECIMAL(12, 2),
    get(this: LeadOffer) {
      const v = (this as any).getDataValue('offerPrice')
      return v == null ? null : Number(v)
    },
  })
  declare offerPrice: number

  @Column(DataType.TEXT)
  declare createdById: string | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date
}

export interface LeadOfferAttributes {
  id: string
  propertyId: string
  offerBy: string
  offerDate: Date
  offerType: string
  offerPrice: number
  createdById: string | null
  createdAt: Date
}
