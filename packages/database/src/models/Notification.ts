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
import { NOTIFICATION_TYPE_VALUES } from '../enums'

/**
 * `Notification` — in-app notifications shown in the bell dropdown.
 * Cascade-delete from User (so deleted users don't leave orphans).
 * `propertyId` is denormalized (no FK) so notifications survive lead
 * deletion.
 */
@Table({ tableName: 'Notification', timestamps: false })
export class Notification extends Model<
  Partial<NotificationAttributes>,
  Partial<NotificationAttributes>
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
  @Column(DataType.ENUM(...NOTIFICATION_TYPE_VALUES))
  declare type:
    | 'NEW_LEAD'
    | 'MESSAGE_RECEIVED'
    | 'TASK_DUE'
    | 'STAGE_CHANGE'
    | 'MENTION'
    | 'SYSTEM'

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare title: string

  @Column(DataType.TEXT) declare body: string | null
  @Column(DataType.TEXT) declare propertyId: string | null

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare isRead: boolean

  @Column(DataType.DATE) declare readAt: Date | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date
}

export interface NotificationAttributes {
  id: string
  userId: string
  type:
    | 'NEW_LEAD'
    | 'MESSAGE_RECEIVED'
    | 'TASK_DUE'
    | 'STAGE_CHANGE'
    | 'MENTION'
    | 'SYSTEM'
  title: string
  body: string | null
  propertyId: string | null
  isRead: boolean
  readAt: Date | null
  createdAt: Date
}
