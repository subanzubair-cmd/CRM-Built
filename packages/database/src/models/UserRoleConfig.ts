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
import { User } from './User'
import { Role } from './Role'

/**
 * `UserRoleConfig` — per-(user, role) settings beyond just the assignment.
 * Currently `leadAccessEnabled` toggles whether this role grants visibility
 * into leads on the relevant campaigns.
 *
 * Composite-unique on (userId, roleId) — i.e. a user holds at most one
 * configuration row per role.
 */
@Table({
  tableName: 'UserRoleConfig',
  timestamps: false,
  indexes: [
    { name: 'UserRoleConfig_userId_roleId_key', unique: true, fields: ['userId', 'roleId'] },
    { name: 'UserRoleConfig_userId_idx', fields: ['userId'] },
    { name: 'UserRoleConfig_roleId_idx', fields: ['roleId'] },
  ],
})
export class UserRoleConfig extends Model<
  Partial<UserRoleConfigAttributes>,
  Partial<UserRoleConfigAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare userId: string

  @ForeignKey(() => Role)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare roleId: string

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare leadAccessEnabled: boolean

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface UserRoleConfigAttributes {
  id: string
  userId: string
  roleId: string
  leadAccessEnabled: boolean
  createdAt: Date
  updatedAt: Date
}
