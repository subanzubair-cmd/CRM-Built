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
import { AUTOMATION_TRIGGER_VALUES } from '../enums'

/**
 * `Automation` — rule-based reactions to lead events (stage change, no
 * contact, etc.). The associated `AutomationAction` rows describe the
 * actions to perform when the trigger fires.
 *
 * `conditions` is a free-form JSONB object whose shape depends on the
 * trigger (e.g. NO_CONTACT_X_DAYS uses `{ days: 7 }`).
 */
@Table({ tableName: 'Automation', timestamps: false })
export class Automation extends Model<
  Partial<AutomationAttributes>,
  Partial<AutomationAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare name: string

  @Column(DataType.TEXT)
  declare description: string | null

  @AllowNull(false)
  @Column(DataType.ENUM(...AUTOMATION_TRIGGER_VALUES))
  declare trigger:
    | 'STAGE_CHANGE'
    | 'LEAD_CREATED'
    | 'TAG_ADDED'
    | 'NO_CONTACT_X_DAYS'
    | 'OFFER_MADE'
    | 'UNDER_CONTRACT'
    | 'MANUAL'

  @AllowNull(false)
  @Default({})
  @Column(DataType.JSONB)
  declare conditions: Record<string, unknown>

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface AutomationAttributes {
  id: string
  name: string
  description: string | null
  trigger:
    | 'STAGE_CHANGE'
    | 'LEAD_CREATED'
    | 'TAG_ADDED'
    | 'NO_CONTACT_X_DAYS'
    | 'OFFER_MADE'
    | 'UNDER_CONTRACT'
    | 'MANUAL'
  conditions: Record<string, unknown>
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
