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
import { GlobalFolder } from './GlobalFolder'

/**
 * `GlobalFile` — generic uploaded files attached optionally to a
 * `GlobalFolder`. The folder FK is `onDelete: SetNull`.
 */
@Table({ tableName: 'GlobalFile', timestamps: false })
export class GlobalFile extends Model<
  Partial<GlobalFileAttributes>,
  Partial<GlobalFileAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare name: string

  @Column(DataType.TEXT)
  declare url: string | null

  @Column(DataType.INTEGER)
  declare size: number | null

  @Column(DataType.TEXT)
  declare mimeType: string | null

  @ForeignKey(() => GlobalFolder)
  @Column(DataType.TEXT)
  declare folderId: string | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare modifiedAt: Date
}

export interface GlobalFileAttributes {
  id: string
  name: string
  url: string | null
  size: number | null
  mimeType: string | null
  folderId: string | null
  createdAt: Date
  modifiedAt: Date
}
