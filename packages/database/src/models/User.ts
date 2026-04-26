import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  Default,
  PrimaryKey,
  Unique,
  ForeignKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'
import { Role } from './Role'

/**
 * `User` — the authenticated CRM operator.
 *
 * Notes on session handling:
 *   - `passwordHash` stores bcrypt output; auth.ts compares it via bcryptjs.
 *   - `sessionVersion` is bumped to invalidate stale JWTs on permission
 *     change. The auth.ts `jwt` callback re-validates against the DB
 *     every 15 minutes; if `user.sessionVersion !== token.sessionVersion`,
 *     the session is rejected and the user must sign in again.
 *   - `permissions` is a Postgres TEXT[] of direct permission grants,
 *     decoupled from `role.permissions` so admins can override per-user.
 */
@Table({ tableName: 'User', timestamps: false })
export class User extends Model<
  Partial<UserAttributes>,
  Partial<UserAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Unique
  @Column(DataType.TEXT)
  declare email: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare passwordHash: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare name: string

  @Column(DataType.TEXT)
  declare phone: string | null

  @Column(DataType.TEXT)
  declare avatarUrl: string | null

  @AllowNull(false)
  @Default('ACTIVE')
  @Column(DataType.ENUM('ACTIVE', 'INACTIVE', 'INVITED'))
  declare status: 'ACTIVE' | 'INACTIVE' | 'INVITED'

  @ForeignKey(() => Role)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare roleId: string

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare permissions: string[]

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare sessionVersion: number

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare marketIds: string[]

  @Column(DataType.JSONB)
  declare notificationPrefs: Record<string, unknown> | null

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare vacationMode: boolean

  @Column(DataType.DATE)
  declare vacationStart: Date | null

  @Column(DataType.DATE)
  declare vacationEnd: Date | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface UserAttributes {
  id: string
  email: string
  passwordHash: string
  name: string
  phone: string | null
  avatarUrl: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'INVITED'
  roleId: string
  permissions: string[]
  sessionVersion: number
  marketIds: string[]
  notificationPrefs: Record<string, unknown> | null
  vacationMode: boolean
  vacationStart: Date | null
  vacationEnd: Date | null
  createdAt: Date
  updatedAt: Date
}
