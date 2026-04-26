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

/**
 * `ApiToken` — long-lived bearer tokens for headless / CLI access.
 * Stored as a sha256 hash plus a public 8-char prefix for identification
 * in lists. The plaintext is only displayed once at creation time.
 */
@Table({
  tableName: 'ApiToken',
  timestamps: false,
  indexes: [{ name: 'ApiToken_userId_idx', fields: ['userId'] }],
})
export class ApiToken extends Model<
  Partial<ApiTokenAttributes>,
  Partial<ApiTokenAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare userId: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare tokenHash: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare prefix: string

  @Column(DataType.DATE)
  declare lastUsedAt: Date | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date
}

export interface ApiTokenAttributes {
  id: string
  userId: string
  tokenHash: string
  prefix: string
  lastUsedAt: Date | null
  createdAt: Date
}
