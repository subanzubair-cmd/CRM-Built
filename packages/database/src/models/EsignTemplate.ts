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

/**
 * `EsignTemplate` — reusable e-sign template metadata. Documents
 * generated from a template reference it via `templateId`.
 */
@Table({ tableName: 'EsignTemplate', timestamps: false })
export class EsignTemplate extends Model<
  Partial<EsignTemplateAttributes>,
  Partial<EsignTemplateAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare name: string

  @Column(DataType.TEXT) declare description: string | null
  @Column(DataType.TEXT) declare documentUrl: string | null

  @AllowNull(false)
  @Default('active')
  @Column(DataType.TEXT)
  declare status: string

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface EsignTemplateAttributes {
  id: string
  name: string
  description: string | null
  documentUrl: string | null
  status: string
  createdAt: Date
  updatedAt: Date
}
