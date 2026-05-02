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
import { User } from './User'

/**
 * `ActivityLog` — domain event log. Every meaningful state change writes
 * a row. `propertyId` and `userId` are nullable (some events aren't
 * tied to a property; system-emitted events have no user). On delete
 * of the related Property/User, ActivityLog rows are kept (SetNull).
 */
@Table({ tableName: 'ActivityLog', timestamps: false })
export class ActivityLog extends Model<
  Partial<ActivityLogAttributes>,
  Partial<ActivityLogAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Property)
  @Column(DataType.TEXT)
  declare propertyId: string | null

  @ForeignKey(() => User)
  @Column(DataType.TEXT)
  declare userId: string | null

  @Column(DataType.TEXT)
  declare userName: string | null

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare action: string

  @AllowNull(false)
  @Default('user')
  @Column(DataType.TEXT)
  declare actorType: string

  @AllowNull(false)
  @Default({})
  @Column(DataType.JSONB)
  declare detail: Record<string, unknown>

  @Column(DataType.TEXT)
  declare mirroredFromPropertyId: string | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date
}

export interface ActivityLogAttributes {
  id: string
  propertyId: string | null
  userId: string | null
  userName: string | null
  action: string
  actorType: string
  detail: Record<string, unknown>
  mirroredFromPropertyId: string | null
  createdAt: Date
}
