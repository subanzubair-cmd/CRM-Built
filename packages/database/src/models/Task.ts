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
import { TASK_STATUS_VALUES, TASK_TYPE_VALUES } from '../enums'

/**
 * `Task` — assignable to-do tied to a Property (or standalone via
 * `propertyId: null`). `repeatType` + `repeatConfigJson` drive the
 * recurring-task generator. On delete of related rows: Property →
 * SetNull (task survives lead deletion).
 */
@Table({ tableName: 'Task', timestamps: false })
export class Task extends Model<
  Partial<TaskAttributes>,
  Partial<TaskAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Property)
  @Column(DataType.TEXT)
  declare propertyId: string | null

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare title: string

  @Column(DataType.TEXT)
  declare description: string | null

  @AllowNull(false)
  @Default('OTHER')
  @Column(DataType.ENUM(...TASK_TYPE_VALUES))
  declare type:
    | 'FOLLOW_UP'
    | 'APPOINTMENT'
    | 'OFFER'
    | 'CALL'
    | 'EMAIL'
    | 'OTHER'

  @AllowNull(false)
  @Default('PENDING')
  @Column(DataType.ENUM(...TASK_STATUS_VALUES))
  declare status: 'PENDING' | 'COMPLETED' | 'CANCELLED'

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare priority: number

  @Column(DataType.DATE) declare dueAt: Date | null
  @Column(DataType.DATE) declare completedAt: Date | null

  @ForeignKey(() => User)
  @Column(DataType.TEXT)
  declare assignedToId: string | null

  @ForeignKey(() => User)
  @Column(DataType.TEXT)
  declare createdById: string | null

  @Column(DataType.TEXT) declare dueTime: string | null
  @Default('manual') @Column(DataType.TEXT) declare sourceType: string | null
  @Column(DataType.TEXT) declare templateId: string | null
  @Column(DataType.TEXT) declare repeatType: string | null
  @Column(DataType.JSONB) declare repeatConfigJson: Record<string, unknown> | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface TaskAttributes {
  id: string
  propertyId: string | null
  title: string
  description: string | null
  type: 'FOLLOW_UP' | 'APPOINTMENT' | 'OFFER' | 'CALL' | 'EMAIL' | 'OTHER'
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED'
  priority: number
  dueAt: Date | null
  completedAt: Date | null
  assignedToId: string | null
  createdById: string | null
  dueTime: string | null
  sourceType: string | null
  templateId: string | null
  repeatType: string | null
  repeatConfigJson: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}
