import {
  Table, Column, Model, DataType, AllowNull, Default, PrimaryKey, ForeignKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'
import { Property } from './Property'
import { AI_ENGINE_VALUES } from '../enums'

/** AI inference audit log per (engine, property, request). */
@Table({ tableName: 'AiLog', timestamps: false })
export class AiLog extends Model<Partial<AiLogAttributes>, Partial<AiLogAttributes>> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string

  @ForeignKey(() => Property) @Column(DataType.TEXT) declare propertyId: string | null

  @AllowNull(false) @Column(DataType.ENUM(...AI_ENGINE_VALUES))
  declare engine:
    | 'TEXT_CONVERSATIONAL'
    | 'LEAD_SUMMARIZATION'
    | 'HOT_LEAD_DETECTION'
    | 'VOICE_CONVERSATIONAL'
    | 'DRIP_PERSONALIZATION'

  @AllowNull(false) @Column(DataType.JSONB) declare input: Record<string, unknown>
  @AllowNull(false) @Column(DataType.JSONB) declare output: Record<string, unknown>
  @Column(DataType.INTEGER) declare tokens: number | null
  @Column(DataType.INTEGER) declare latencyMs: number | null
  @AllowNull(false) @Default(false) @Column(DataType.BOOLEAN) declare reviewed: boolean
  @Column(DataType.DATE) declare reviewedAt: Date | null
  @Column(DataType.TEXT) declare reviewedById: string | null

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
}

export interface AiLogAttributes {
  id: string
  propertyId: string | null
  engine: 'TEXT_CONVERSATIONAL' | 'LEAD_SUMMARIZATION' | 'HOT_LEAD_DETECTION' | 'VOICE_CONVERSATIONAL' | 'DRIP_PERSONALIZATION'
  input: Record<string, unknown>
  output: Record<string, unknown>
  tokens: number | null
  latencyMs: number | null
  reviewed: boolean
  reviewedAt: Date | null
  reviewedById: string | null
  createdAt: Date
}
