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
 * `Role` — labeled bundle of permissions used to seed user permissions
 * on creation. Per project decisions, the actual auth check uses
 * `User.permissions` (with `role.permissions` as a fallback for legacy
 * users); the role itself has become more of a label than a real
 * authorization unit.
 */
@Table({ tableName: 'Role', timestamps: false })
export class Role extends Model<
  Partial<RoleAttributes>,
  Partial<RoleAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Unique
  @Column(DataType.TEXT)
  declare name: string

  @Column(DataType.TEXT)
  declare description: string | null

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare permissions: string[]

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare isSystem: boolean

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface RoleAttributes {
  id: string
  name: string
  description: string | null
  permissions: string[]
  isSystem: boolean
  createdAt: Date
  updatedAt: Date
}
