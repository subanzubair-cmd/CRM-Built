import {
  Table, Column, Model, DataType, AllowNull, Default, PrimaryKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'

function dec(field: string) {
  return {
    type: DataType.DECIMAL(14, 2),
    get(this: any) {
      const v = this.getDataValue(field)
      return v == null ? null : Number(v)
    },
  }
}

/** Bank / cash account ledger row. Balance + startBalance shimmed to numbers. */
@Table({ tableName: 'FinancialAccount', timestamps: false })
export class FinancialAccount extends Model<Partial<FinancialAccountAttributes>, Partial<FinancialAccountAttributes>> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string
  @AllowNull(false) @Column(DataType.TEXT) declare bankName: string
  @Column(DataType.TEXT) declare accountType: string | null
  @AllowNull(false) @Default(0) @Column(dec('balance')) declare balance: number
  @AllowNull(false) @Default(0) @Column(dec('startBalance')) declare startBalance: number

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare lastUpdated: Date
  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare updatedAt: Date
}

export interface FinancialAccountAttributes {
  id: string
  bankName: string
  accountType: string | null
  balance: number
  startBalance: number
  lastUpdated: Date
  createdAt: Date
  updatedAt: Date
}
