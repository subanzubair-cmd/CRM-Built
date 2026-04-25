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
 * `Tag` — labels attached to leads, buyers, or tasks. Composite-unique on
 * `(name, category)` so the same name can exist under different categories.
 */
@Table({
  tableName: 'Tag',
  timestamps: false,
  indexes: [{ name: 'Tag_name_category_key', unique: true, fields: ['name', 'category'] }],
})
export class Tag extends Model<
  Partial<TagAttributes>,
  Partial<TagAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare name: string

  @AllowNull(false)
  @Default('#3B82F6')
  @Column(DataType.TEXT)
  declare color: string

  @AllowNull(false)
  @Default('lead')
  @Column(DataType.TEXT)
  declare category: string

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface TagAttributes {
  id: string
  name: string
  color: string
  category: string
  createdAt: Date
  updatedAt: Date
}
