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

/**
 * `BuyerCriteria` — investment criteria filters used by the matching
 * engine. Multiple criteria sets per buyer are allowed; the matcher
 * unions across them. All Decimal columns get a `get()` shim so call
 * sites that read them as numbers continue to work without manual
 * `Number()` coercion at every site.
 */
@Table({ tableName: 'BuyerCriteria', timestamps: false })
export class BuyerCriteria extends Model<
  Partial<BuyerCriteriaAttributes>,
  Partial<BuyerCriteriaAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Buyer)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare buyerId: string

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare markets: string[]

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare propertyTypes: string[]

  @Column(DataType.INTEGER)
  declare minBeds: number | null

  @Column(DataType.INTEGER)
  declare maxBeds: number | null

  @Column({
    type: DataType.DECIMAL(4, 1),
    get(this: BuyerCriteria) {
      const v = (this as any).getDataValue('minBaths')
      return v == null ? null : Number(v)
    },
  })
  declare minBaths: number | null

  @Column({
    type: DataType.DECIMAL(4, 1),
    get(this: BuyerCriteria) {
      const v = (this as any).getDataValue('maxBaths')
      return v == null ? null : Number(v)
    },
  })
  declare maxBaths: number | null

  @Column({
    type: DataType.DECIMAL(12, 2),
    get(this: BuyerCriteria) {
      const v = (this as any).getDataValue('minPrice')
      return v == null ? null : Number(v)
    },
  })
  declare minPrice: number | null

  @Column({
    type: DataType.DECIMAL(12, 2),
    get(this: BuyerCriteria) {
      const v = (this as any).getDataValue('maxPrice')
      return v == null ? null : Number(v)
    },
  })
  declare maxPrice: number | null

  @Column(DataType.INTEGER)
  declare minSqft: number | null

  @Column(DataType.INTEGER)
  declare maxSqft: number | null

  @Column({
    type: DataType.DECIMAL(12, 2),
    get(this: BuyerCriteria) {
      const v = (this as any).getDataValue('minArv')
      return v == null ? null : Number(v)
    },
  })
  declare minArv: number | null

  @Column({
    type: DataType.DECIMAL(12, 2),
    get(this: BuyerCriteria) {
      const v = (this as any).getDataValue('maxArv')
      return v == null ? null : Number(v)
    },
  })
  declare maxArv: number | null

  @Column({
    type: DataType.DECIMAL(12, 2),
    get(this: BuyerCriteria) {
      const v = (this as any).getDataValue('maxRepairs')
      return v == null ? null : Number(v)
    },
  })
  declare maxRepairs: number | null

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

export interface BuyerCriteriaAttributes {
  id: string
  buyerId: string
  markets: string[]
  propertyTypes: string[]
  minBeds: number | null
  maxBeds: number | null
  minBaths: number | null
  maxBaths: number | null
  minPrice: number | null
  maxPrice: number | null
  minSqft: number | null
  maxSqft: number | null
  minArv: number | null
  maxArv: number | null
  maxRepairs: number | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}
