import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  Default,
  PrimaryKey,
  Unique,
} from 'sequelize-typescript'
import { newCuid } from './_id'

/**
 * `LeadSource` — where a lead originated (Direct Mail, Cold Calling, etc.).
 *
 * Mirrors `model LeadSource` in `prisma/schema.prisma`. Schema is owned by
 * Umzug post-Phase-1; these decorators describe the existing Postgres
 * table, they don't generate DDL.
 */
@Table({
  tableName: 'LeadSource',
  timestamps: false, // managed manually below to match Prisma's @updatedAt semantics
})
export class LeadSource extends Model<
  Partial<LeadSourceAttributes>,
  Partial<LeadSourceAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Unique
  @Column(DataType.TEXT)
  declare name: string

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare isSystem: boolean

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface LeadSourceAttributes {
  id: string
  name: string
  isActive: boolean
  isSystem: boolean
  createdAt: Date
  updatedAt: Date
}
