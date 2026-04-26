import {
  Table, Column, Model, DataType, AllowNull, Default, PrimaryKey, ForeignKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'
import { FinancialAccount } from './FinancialAccount'
import { AccountTag } from './AccountTag'

/** Single ledger entry for a FinancialAccount. Cascade-deletes with the account. */
@Table({ tableName: 'FinancialTransaction', timestamps: false })
export class FinancialTransaction extends Model<Partial<FinancialTransactionAttributes>, Partial<FinancialTransactionAttributes>> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string
  @AllowNull(false) @Column(DataType.DATE) declare date: Date
  @AllowNull(false) @Column(DataType.TEXT) declare description: string

  @AllowNull(false)
  @Column({
    type: DataType.DECIMAL(14, 2),
    get(this: FinancialTransaction) {
      const v = (this as any).getDataValue('amount')
      return v == null ? null : Number(v)
    },
  })
  declare amount: number

  @AllowNull(false) @Default('expense') @Column(DataType.TEXT) declare type: string

  @ForeignKey(() => FinancialAccount) @AllowNull(false) @Column(DataType.TEXT)
  declare accountId: string

  @Column(DataType.TEXT) declare vendorName: string | null
  @Column(DataType.TEXT) declare propertyId: string | null

  @ForeignKey(() => AccountTag) @Column(DataType.TEXT) declare categoryId: string | null

  @Column(DataType.TEXT) declare createdById: string | null

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
}

export interface FinancialTransactionAttributes {
  id: string
  date: Date
  description: string
  amount: number
  type: string
  accountId: string
  vendorName: string | null
  propertyId: string | null
  categoryId: string | null
  createdById: string | null
  createdAt: Date
}
