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
 * `ListStackSource` — imported list of properties (e.g. an absentee-owner
 * list from PropStream). The `tags: String[]` is a Postgres TEXT[] array.
 */
@Table({ tableName: 'ListStackSource', timestamps: false })
export class ListStackSource extends Model<
  Partial<ListStackSourceAttributes>,
  Partial<ListStackSourceAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare name: string

  @Column(DataType.TEXT)
  declare description: string | null

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare tags: string[]

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare totalImported: number

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface ListStackSourceAttributes {
  id: string
  name: string
  description: string | null
  tags: string[]
  totalImported: number
  createdAt: Date
  updatedAt: Date
}
