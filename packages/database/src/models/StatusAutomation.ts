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
import { WORKSPACE_TYPE_VALUES } from '../enums'

/**
 * `StatusAutomation` — per (workspace, stage) hooks for drip-campaign
 * enrollment + task creation when a property reaches that stage.
 *
 * `stageCode` is intentionally free-form text (not an enum) because
 * each workspace has a different set of stages and Postgres enums
 * with 50+ values become painful to manage.
 */
@Table({
  tableName: 'StatusAutomation',
  timestamps: false,
  indexes: [
    {
      name: 'StatusAutomation_workspaceType_stageCode_key',
      unique: true,
      fields: ['workspaceType', 'stageCode'],
    },
  ],
})
export class StatusAutomation extends Model<
  Partial<StatusAutomationAttributes>,
  Partial<StatusAutomationAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Column(DataType.ENUM(...WORKSPACE_TYPE_VALUES))
  declare workspaceType: 'leads' | 'tm' | 'inventory' | 'sold' | 'rental'

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare stageCode: string

  @Column(DataType.TEXT)
  declare dripCampaignId: string | null

  @Column(DataType.TEXT)
  declare taskTemplateId: string | null

  @Column(DataType.TEXT)
  declare taskTitle: string | null

  @Column(DataType.TEXT)
  declare taskAssigneeId: string | null

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

export interface StatusAutomationAttributes {
  id: string
  workspaceType: 'leads' | 'tm' | 'inventory' | 'sold' | 'rental'
  stageCode: string
  dripCampaignId: string | null
  taskTemplateId: string | null
  taskTitle: string | null
  taskAssigneeId: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
