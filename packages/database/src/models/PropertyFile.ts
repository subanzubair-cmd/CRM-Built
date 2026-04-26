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
import { Property } from './Property'
import { FILE_TYPE_VALUES } from '../enums'

/**
 * `PropertyFile` — file attached to a Property (photo, contract, etc.).
 * `storageKey` references the MinIO / S3 object. Cascade-deletes when
 * the parent Property is deleted.
 */
@Table({ tableName: 'PropertyFile', timestamps: false })
export class PropertyFile extends Model<
  Partial<PropertyFileAttributes>,
  Partial<PropertyFileAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Property)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare propertyId: string

  @AllowNull(false)
  @Default('OTHER')
  @Column(DataType.ENUM(...FILE_TYPE_VALUES))
  declare type:
    | 'DOCUMENT'
    | 'IMAGE'
    | 'CONTRACT'
    | 'INSPECTION'
    | 'PHOTO'
    | 'OTHER'

  @AllowNull(false) @Column(DataType.TEXT) declare name: string
  @AllowNull(false) @Column(DataType.TEXT) declare mimeType: string
  @AllowNull(false) @Column(DataType.INTEGER) declare size: number
  @AllowNull(false) @Column(DataType.TEXT) declare storageKey: string

  @Column(DataType.TEXT) declare uploadedById: string | null
  @Column(DataType.TEXT) declare uploadedByName: string | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date
}

export interface PropertyFileAttributes {
  id: string
  propertyId: string
  type: 'DOCUMENT' | 'IMAGE' | 'CONTRACT' | 'INSPECTION' | 'PHOTO' | 'OTHER'
  name: string
  mimeType: string
  size: number
  storageKey: string
  uploadedById: string | null
  uploadedByName: string | null
  createdAt: Date
}
