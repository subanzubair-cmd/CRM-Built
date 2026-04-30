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
import { ImportJob } from './ImportJob'

/**
 * `ImportJobRow` — one row from the source CSV. We keep failures
 * (succeeded=false + error) so the user can download an
 * error-report CSV and fix their data. Successful rows are also
 * recorded with their `createdEntityId` so the import can be
 * "rolled back" if the user discovers a bad upload.
 */
@Table({ tableName: 'ImportJobRow', timestamps: false })
export class ImportJobRow extends Model<
  Partial<ImportJobRowAttributes>,
  Partial<ImportJobRowAttributes>
> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string

  @ForeignKey(() => ImportJob)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare jobId: string

  @AllowNull(false) @Column(DataType.INTEGER) declare rowIndex: number
  @AllowNull(false) @Column(DataType.BOOLEAN) declare succeeded: boolean
  @Column(DataType.TEXT) declare error: string | null
  @Column(DataType.JSONB) declare rawRow: Record<string, unknown> | null
  @Column(DataType.TEXT) declare createdEntityId: string | null

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
}

export interface ImportJobRowAttributes {
  id: string
  jobId: string
  rowIndex: number
  succeeded: boolean
  error: string | null
  rawRow: Record<string, unknown> | null
  createdEntityId: string | null
  createdAt: Date
}
