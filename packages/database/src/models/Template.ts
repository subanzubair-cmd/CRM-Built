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
import { TEMPLATE_TYPE_VALUES } from '../enums'

/**
 * `Template` — reusable SMS / email / RVM / task / direct mail content.
 * `category` is free-form so admins can group templates without schema
 * changes (e.g. "follow-up", "appointment-confirm").
 */
@Table({ tableName: 'Template', timestamps: false })
export class Template extends Model<
  Partial<TemplateAttributes>,
  Partial<TemplateAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Column(DataType.ENUM(...TEMPLATE_TYPE_VALUES))
  declare templateType: 'sms' | 'email' | 'rvm' | 'task' | 'direct_mail'

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare name: string

  @Column(DataType.TEXT)
  declare category: string | null

  @Column(DataType.TEXT)
  declare subject: string | null

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare bodyContent: string

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

export interface TemplateAttributes {
  id: string
  templateType: 'sms' | 'email' | 'rvm' | 'task' | 'direct_mail'
  name: string
  category: string | null
  subject: string | null
  bodyContent: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
