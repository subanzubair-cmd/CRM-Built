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
import { EsignTemplate } from './EsignTemplate'

/**
 * `EsignDocument` — instance of an e-sign request, optionally derived
 * from an `EsignTemplate`. `providerRef` is the external (DocuSign /
 * etc.) document ID.
 */
@Table({ tableName: 'EsignDocument', timestamps: false })
export class EsignDocument extends Model<
  Partial<EsignDocumentAttributes>,
  Partial<EsignDocumentAttributes>
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
  @Column(DataType.TEXT)
  declare name: string

  @Column(DataType.TEXT) declare providerRef: string | null

  @AllowNull(false)
  @Default('DRAFT')
  @Column(DataType.TEXT)
  declare status: string

  @Column(DataType.DATE) declare signedAt: Date | null
  @Column(DataType.TEXT) declare storageKey: string | null

  @ForeignKey(() => EsignTemplate)
  @Column(DataType.TEXT)
  declare templateId: string | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface EsignDocumentAttributes {
  id: string
  propertyId: string
  name: string
  providerRef: string | null
  status: string
  signedAt: Date | null
  storageKey: string | null
  templateId: string | null
  createdAt: Date
  updatedAt: Date
}
