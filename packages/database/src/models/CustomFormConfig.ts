import {
  Table, Column, Model, DataType, AllowNull, Default, PrimaryKey, Unique,
} from 'sequelize-typescript'
import { newCuid } from './_id'

/** Form-builder config per entity type (leads, buyers, vendors, etc.). */
@Table({ tableName: 'CustomFormConfig', timestamps: false })
export class CustomFormConfig extends Model<Partial<CustomFormConfigAttributes>, Partial<CustomFormConfigAttributes>> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string
  @AllowNull(false) @Unique @Column(DataType.TEXT) declare entityType: string

  @AllowNull(false) @Default([]) @Column(DataType.JSONB)
  declare sections: Array<Record<string, unknown>>

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare updatedAt: Date
}

export interface CustomFormConfigAttributes {
  id: string
  entityType: string
  sections: Array<Record<string, unknown>>
  createdAt: Date
  updatedAt: Date
}
