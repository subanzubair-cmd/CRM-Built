import {
  Table, Column, Model, DataType, AllowNull, Default, PrimaryKey, Unique,
} from 'sequelize-typescript'
import { newCuid } from './_id'

/** Chart-of-accounts category for FinancialTransaction.categoryId. */
@Table({ tableName: 'AccountTag', timestamps: false })
export class AccountTag extends Model<Partial<AccountTagAttributes>, Partial<AccountTagAttributes>> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string
  @AllowNull(false) @Unique @Column(DataType.TEXT) declare name: string
  @AllowNull(false) @Default('expense') @Column(DataType.TEXT) declare accountType: string
  @Column(DataType.TEXT) declare category: string | null
  @Column(DataType.TEXT) declare subCategory: string | null

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
}

export interface AccountTagAttributes {
  id: string
  name: string
  accountType: string
  category: string | null
  subCategory: string | null
  createdAt: Date
}
