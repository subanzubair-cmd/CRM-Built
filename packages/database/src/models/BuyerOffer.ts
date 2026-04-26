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

function dec(field: string) {
  return {
    type: DataType.DECIMAL(12, 2),
    get(this: any) {
      const v = this.getDataValue(field)
      return v == null ? null : Number(v)
    },
  }
}

/**
 * `BuyerOffer` — a buyer's offer (or counter) on a property. Distinct
 * from `LeadOffer` (our offers TO sellers). `recordType` distinguishes
 * "offer", "counter", etc. Stored money columns are Decimal(12,2)
 * with a get() shim to surface as JS numbers.
 */
@Table({ tableName: 'BuyerOffer', timestamps: false })
export class BuyerOffer extends Model<
  Partial<BuyerOfferAttributes>,
  Partial<BuyerOfferAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Property)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare propertyId: string

  @ForeignKey(() => Buyer)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare buyerId: string

  @AllowNull(false)
  @Column(dec('dispoOfferAmount'))
  declare dispoOfferAmount: number

  @AllowNull(false)
  @Default('PENDING')
  @Column(DataType.TEXT)
  declare status: string

  @AllowNull(false)
  @Default('offer')
  @Column(DataType.TEXT)
  declare recordType: string

  @Column(dec('earnestMoney')) declare earnestMoney: number | null
  @Column(DataType.DATE) declare inspectionEndDate: Date | null
  @Column(DataType.JSONB) declare contractPayload: Record<string, unknown> | null
  @Column(DataType.TEXT) declare notes: string | null
  @Column(DataType.DATE) declare closingDate: Date | null
  @Column(DataType.TEXT) declare exitTypeSnapshot: string | null
  @Column(dec('expectedProfit')) declare expectedProfit: number | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare submittedAt: Date

  @Column(DataType.DATE) declare respondedAt: Date | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface BuyerOfferAttributes {
  id: string
  propertyId: string
  buyerId: string
  dispoOfferAmount: number
  status: string
  recordType: string
  earnestMoney: number | null
  inspectionEndDate: Date | null
  contractPayload: Record<string, unknown> | null
  notes: string | null
  closingDate: Date | null
  exitTypeSnapshot: string | null
  expectedProfit: number | null
  submittedAt: Date
  respondedAt: Date | null
  updatedAt: Date
}
