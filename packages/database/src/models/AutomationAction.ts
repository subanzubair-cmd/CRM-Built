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
import { Automation } from './Automation'
import { AUTOMATION_ACTION_TYPE_VALUES } from '../enums'

/**
 * `AutomationAction` — single action attached to an `Automation`.
 * Multiple actions per automation, ordered by `order`.
 */
@Table({ tableName: 'AutomationAction', timestamps: false })
export class AutomationAction extends Model<
  Partial<AutomationActionAttributes>,
  Partial<AutomationActionAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Automation)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare automationId: string

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare order: number

  @AllowNull(false)
  @Column(DataType.ENUM(...AUTOMATION_ACTION_TYPE_VALUES))
  declare actionType:
    | 'SEND_SMS'
    | 'SEND_EMAIL'
    | 'SEND_RVM'
    | 'ADD_TAG'
    | 'CHANGE_STAGE'
    | 'ASSIGN_USER'
    | 'CREATE_TASK'
    | 'ENROLL_CAMPAIGN'

  @AllowNull(false)
  @Default({})
  @Column(DataType.JSONB)
  declare config: Record<string, unknown>

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date
}

export interface AutomationActionAttributes {
  id: string
  automationId: string
  order: number
  actionType:
    | 'SEND_SMS'
    | 'SEND_EMAIL'
    | 'SEND_RVM'
    | 'ADD_TAG'
    | 'CHANGE_STAGE'
    | 'ASSIGN_USER'
    | 'CREATE_TASK'
    | 'ENROLL_CAMPAIGN'
  config: Record<string, unknown>
  createdAt: Date
}
