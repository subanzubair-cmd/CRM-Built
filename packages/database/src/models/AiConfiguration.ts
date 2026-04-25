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
 * `AiConfiguration` — per-capability AI settings (call answer, lead summary,
 * etc.). Each capability has independent enable/disable + JSON config.
 */
@Table({ tableName: 'AiConfiguration', timestamps: false })
export class AiConfiguration extends Model<
  Partial<AiConfigurationAttributes>,
  Partial<AiConfigurationAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Unique
  @Column(DataType.TEXT)
  declare capabilityType: string

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare isEnabled: boolean

  @AllowNull(false)
  @Default({})
  @Column(DataType.JSONB)
  declare configJson: Record<string, unknown>

  @AllowNull(false)
  @Default({})
  @Column(DataType.JSONB)
  declare voiceSettings: Record<string, unknown>

  @AllowNull(false)
  @Default({})
  @Column(DataType.JSONB)
  declare escalationRules: Record<string, unknown>

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface AiConfigurationAttributes {
  id: string
  capabilityType: string
  isEnabled: boolean
  configJson: Record<string, unknown>
  voiceSettings: Record<string, unknown>
  escalationRules: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}
