import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  Default,
  PrimaryKey,
  Unique,
} from 'sequelize-typescript'
import { newCuid } from './_id'

/**
 * `Market` — geographic submarkets a lead can belong to (e.g. "DFW",
 * "Houston"). Top-level markets are scoped to a state.
 */
@Table({ tableName: 'Market', timestamps: false })
export class Market extends Model<
  Partial<MarketAttributes>,
  Partial<MarketAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Unique
  @Column(DataType.TEXT)
  declare name: string

  @AllowNull(false)
  @Default('TX')
  @Column(DataType.TEXT)
  declare state: string

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface MarketAttributes {
  id: string
  name: string
  state: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
