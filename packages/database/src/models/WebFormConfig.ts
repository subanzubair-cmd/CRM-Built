import {
  Table, Column, Model, DataType, AllowNull, Default, PrimaryKey, Unique,
} from 'sequelize-typescript'
import { newCuid } from './_id'

/** Embeddable web-form config per entity type. */
@Table({ tableName: 'WebFormConfig', timestamps: false })
export class WebFormConfig extends Model<Partial<WebFormConfigAttributes>, Partial<WebFormConfigAttributes>> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string
  @AllowNull(false) @Unique @Column(DataType.TEXT) declare entityType: string

  @AllowNull(false) @Default([]) @Column(DataType.JSONB)
  declare fields: Array<Record<string, unknown>>

  @Column(DataType.TEXT) declare embedCode: string | null

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare updatedAt: Date
}

export interface WebFormConfigAttributes {
  id: string
  entityType: string
  fields: Array<Record<string, unknown>>
  embedCode: string | null
  createdAt: Date
  updatedAt: Date
}
