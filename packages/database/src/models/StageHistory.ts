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
 * `StageHistory` — append-only audit row for every stage transition.
 * `pipeline` is free-form text (matches the workspace types: leads, tm,
 * inventory, etc.). `fromStage` is null for the initial row when the
 * lead is created.
 */
@Table({ tableName: 'StageHistory', timestamps: false })
export class StageHistory extends Model<
  Partial<StageHistoryAttributes>,
  Partial<StageHistoryAttributes>
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
  declare pipeline: string

  @Column(DataType.TEXT)
  declare fromStage: string | null

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare toStage: string

  @Column(DataType.TEXT)
  declare changedById: string | null

  @Column(DataType.TEXT)
  declare changedByName: string | null

  @Column(DataType.TEXT)
  declare reason: string | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date
}

export interface StageHistoryAttributes {
  id: string
  propertyId: string
  pipeline: string
  fromStage: string | null
  toStage: string
  changedById: string | null
  changedByName: string | null
  reason: string | null
  createdAt: Date
}
