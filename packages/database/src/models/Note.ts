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
 * `Note` — free-form note attached to a Property. `authorId` /
 * `authorName` are denormalized so notes survive author deletion.
 */
@Table({ tableName: 'Note', timestamps: false })
export class Note extends Model<
  Partial<NoteAttributes>,
  Partial<NoteAttributes>
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
  declare body: string

  @Column(DataType.TEXT)
  declare authorId: string | null

  @Column(DataType.TEXT)
  declare authorName: string | null

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare isPinned: boolean

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface NoteAttributes {
  id: string
  propertyId: string
  body: string
  authorId: string | null
  authorName: string | null
  isPinned: boolean
  createdAt: Date
  updatedAt: Date
}
