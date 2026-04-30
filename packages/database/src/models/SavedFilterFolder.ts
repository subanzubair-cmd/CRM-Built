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
 * `SavedFilterFolder` — per-user grouping for `SavedFilter` rows. A
 * folder belongs to a single user and a single pipeline (e.g.
 * 'buyers' | 'leads' | 'vendors'). Saved filters with NULL folderId
 * render as standalone "Individual Filters" in the Manage Filters
 * modal.
 */
@Table({
  tableName: 'SavedFilterFolder',
  timestamps: false,
  indexes: [
    {
      name: 'SavedFilterFolder_userId_name_pipeline_key',
      unique: true,
      fields: ['userId', 'name', 'pipeline'],
    },
  ],
})
export class SavedFilterFolder extends Model<
  Partial<SavedFilterFolderAttributes>,
  Partial<SavedFilterFolderAttributes>
> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string

  @AllowNull(false) @Column(DataType.TEXT) declare userId: string
  @AllowNull(false) @Column(DataType.TEXT) declare name: string
  @AllowNull(false) @Column(DataType.TEXT) declare pipeline: string

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare updatedAt: Date
}

export interface SavedFilterFolderAttributes {
  id: string
  userId: string
  name: string
  pipeline: string
  createdAt: Date
  updatedAt: Date
}
