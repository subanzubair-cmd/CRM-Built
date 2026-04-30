import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  Default,
  PrimaryKey,
  ForeignKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'
import {
  SAVED_FILTER_SHARE_LEVEL_VALUES,
  type SavedFilterShareLevel,
} from '../enums'
import { SavedFilter } from './SavedFilter'

/**
 * `SavedFilterShare` — explicit per-user permission rows for a shared
 * SavedFilter. The Manage Sharing UI in the spec lets the owner pick
 * NONE / VIEW / EDIT for each teammate; a row is only inserted when
 * the level is non-default. NONE rows are kept around so revocations
 * are auditable (i.e. "we explicitly took View access away from X").
 */
@Table({
  tableName: 'SavedFilterShare',
  timestamps: false,
  indexes: [
    {
      name: 'SavedFilterShare_filter_user_key',
      unique: true,
      fields: ['savedFilterId', 'userId'],
    },
  ],
})
export class SavedFilterShare extends Model<
  Partial<SavedFilterShareAttributes>,
  Partial<SavedFilterShareAttributes>
> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string

  @ForeignKey(() => SavedFilter)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare savedFilterId: string

  @AllowNull(false) @Column(DataType.TEXT) declare userId: string

  @AllowNull(false)
  @Default('NONE')
  @Column(DataType.ENUM(...SAVED_FILTER_SHARE_LEVEL_VALUES))
  declare level: SavedFilterShareLevel

  @Column(DataType.TEXT) declare grantedById: string | null

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare grantedAt: Date
}

export interface SavedFilterShareAttributes {
  id: string
  savedFilterId: string
  userId: string
  level: SavedFilterShareLevel
  grantedById: string | null
  grantedAt: Date
}
