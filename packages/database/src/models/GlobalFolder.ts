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
 * `GlobalFolder` — top-level folder tree for global file storage. The
 * `parentId` self-reference allows nested folders but Prisma doesn't model
 * it as a typed relation; we keep it as an opaque `parentId: string | null`
 * to match.
 */
@Table({ tableName: 'GlobalFolder', timestamps: false })
export class GlobalFolder extends Model<
  Partial<GlobalFolderAttributes>,
  Partial<GlobalFolderAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare name: string

  @Column(DataType.TEXT)
  declare parentId: string | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date
}

export interface GlobalFolderAttributes {
  id: string
  name: string
  parentId: string | null
  createdAt: Date
}
