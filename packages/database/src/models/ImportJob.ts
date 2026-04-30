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
import {
  IMPORT_JOB_STATUS_VALUES,
  IMPORT_JOB_MODULE_VALUES,
  type ImportJobStatus,
  type ImportJobModule,
} from '../enums'

/**
 * `ImportJob` — one CSV import attempt for the Buyers (or Vendors)
 * module. The CSV file goes to MinIO under `fileStorageKey`; this
 * row tracks status + per-row outcome counts. The full per-row
 * breakdown lives in `ImportJobRow`.
 */
@Table({ tableName: 'ImportJob', timestamps: false })
export class ImportJob extends Model<
  Partial<ImportJobAttributes>,
  Partial<ImportJobAttributes>
> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string

  @AllowNull(false)
  @Column(DataType.ENUM(...IMPORT_JOB_MODULE_VALUES))
  declare module: ImportJobModule

  @Column(DataType.TEXT) declare createdById: string | null

  @AllowNull(false) @Column(DataType.TEXT) declare fileName: string
  @AllowNull(false) @Default(0) @Column(DataType.INTEGER) declare fileSize: number
  @Column(DataType.TEXT) declare fileStorageKey: string | null

  @AllowNull(false) @Default(0) @Column(DataType.INTEGER) declare totalRows: number
  @AllowNull(false) @Default(0) @Column(DataType.INTEGER) declare processedRows: number
  @AllowNull(false) @Default(0) @Column(DataType.INTEGER) declare failedRows: number

  @AllowNull(false)
  @Default('QUEUED')
  @Column(DataType.ENUM(...IMPORT_JOB_STATUS_VALUES))
  declare status: ImportJobStatus

  @Column(DataType.TEXT) declare errorMessage: string | null

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
  @Column(DataType.DATE) declare completedAt: Date | null
}

export interface ImportJobAttributes {
  id: string
  module: ImportJobModule
  createdById: string | null
  fileName: string
  fileSize: number
  fileStorageKey: string | null
  totalRows: number
  processedRows: number
  failedRows: number
  status: ImportJobStatus
  errorMessage: string | null
  createdAt: Date
  completedAt: Date | null
}
