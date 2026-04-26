import {
  Table, Column, Model, DataType, AllowNull, Default, PrimaryKey, ForeignKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'
import { User } from './User'

/** Per-user yearly target by type (REVENUE/MARKETING_SPEND/NET_INCOME). Decimal target shimmed to number. */
@Table({
  tableName: 'FinancialGoal',
  timestamps: false,
  indexes: [{
    name: 'FinancialGoal_userId_year_type_key',
    unique: true,
    fields: ['userId', 'year', 'type'],
  }],
})
export class FinancialGoal extends Model<Partial<FinancialGoalAttributes>, Partial<FinancialGoalAttributes>> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string
  @AllowNull(false) @Column(DataType.INTEGER) declare year: number
  @AllowNull(false) @Column(DataType.TEXT) declare type: string

  @AllowNull(false)
  @Column({
    type: DataType.DECIMAL(14, 2),
    get(this: FinancialGoal) {
      const v = (this as any).getDataValue('target')
      return v == null ? null : Number(v)
    },
  })
  declare target: number

  @ForeignKey(() => User) @AllowNull(false) @Column(DataType.TEXT) declare userId: string

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare updatedAt: Date
}

export interface FinancialGoalAttributes {
  id: string
  year: number
  type: string
  target: number
  userId: string
  createdAt: Date
  updatedAt: Date
}
