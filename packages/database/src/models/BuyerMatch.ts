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
import { Buyer } from './Buyer'
import { Property } from './Property'
// DispoStage values kept as a type reference; column is now TEXT
// to support custom stages added via Settings > Pipeline Management.

/**
 * `BuyerMatch` — output of the buyer-matching engine. Composite-unique
 * on (buyerId, propertyId) so a buyer is matched at most once per
 * property. `dispoStage` follows the dispo pipeline once a match is
 * being worked.
 */
@Table({
  tableName: 'BuyerMatch',
  timestamps: false,
  indexes: [
    {
      name: 'BuyerMatch_buyerId_propertyId_key',
      unique: true,
      fields: ['buyerId', 'propertyId'],
    },
  ],
})
export class BuyerMatch extends Model<
  Partial<BuyerMatchAttributes>,
  Partial<BuyerMatchAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Buyer)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare buyerId: string

  @ForeignKey(() => Property)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare propertyId: string

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare score: number

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare notified: boolean

  @AllowNull(false)
  @Default('POTENTIAL_BUYER')
  @Column(DataType.TEXT)
  declare dispoStage: string

  @Column({
    type: DataType.DECIMAL(12, 2),
    get(this: BuyerMatch) {
      const v = (this as any).getDataValue('dispoOfferAmount')
      return v == null ? null : Number(v)
    },
  })
  declare dispoOfferAmount: number | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date
}

export interface BuyerMatchAttributes {
  id: string
  buyerId: string
  propertyId: string
  score: number
  notified: boolean
  dispoStage: string
  dispoOfferAmount: number | null
  createdAt: Date
}
