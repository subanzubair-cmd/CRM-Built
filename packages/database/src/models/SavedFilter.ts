import {
  Table, Column, Model, DataType, AllowNull, Default, PrimaryKey, ForeignKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'
import { User } from './User'

/** Per-user saved filter for a pipeline view. Composite-unique on (userId, name, pipeline). */
@Table({
  tableName: 'SavedFilter',
  timestamps: false,
  indexes: [{
    name: 'SavedFilter_userId_name_pipeline_key',
    unique: true,
    fields: ['userId', 'name', 'pipeline'],
  }],
})
export class SavedFilter extends Model<Partial<SavedFilterAttributes>, Partial<SavedFilterAttributes>> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string

  @ForeignKey(() => User) @AllowNull(false) @Column(DataType.TEXT) declare userId: string

  @AllowNull(false) @Column(DataType.TEXT) declare name: string
  @AllowNull(false) @Column(DataType.TEXT) declare pipeline: string
  @AllowNull(false) @Column(DataType.JSONB) declare filters: Record<string, unknown>
  @AllowNull(false) @Default(false) @Column(DataType.BOOLEAN) declare isDefault: boolean

  /** NULL = standalone "Individual Filter"; otherwise FK to
   *  SavedFilterFolder. Soft FK (no CASCADE) so deleting a folder
   *  doesn't lose the filters — they re-appear as Individual. */
  @Column(DataType.TEXT)
  declare folderId: string | null

  @Column(DataType.TEXT)
  declare description: string | null

  /** Mirror of `EXISTS(SELECT 1 FROM SavedFilterShare WHERE level <> 'NONE')`
   *  — kept on the row so the Manage Filters list can show a sharing
   *  badge without an extra JOIN. */
  @AllowNull(false) @Default(false) @Column(DataType.BOOLEAN) declare shared: boolean

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare updatedAt: Date
}

export interface SavedFilterAttributes {
  id: string
  userId: string
  name: string
  pipeline: string
  filters: Record<string, unknown>
  isDefault: boolean
  folderId: string | null
  description: string | null
  shared: boolean
  createdAt: Date
  updatedAt: Date
}
