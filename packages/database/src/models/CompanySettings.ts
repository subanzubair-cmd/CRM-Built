import {
  Table, Column, Model, DataType, AllowNull, Default, PrimaryKey,
} from 'sequelize-typescript'

/**
 * CompanySettings — singleton row that holds CRM-wide configuration.
 *
 * Always accessed by id='singleton'. Use the helpers in
 * apps/web/src/lib/company-settings.ts to read/write so the singleton
 * pattern is enforced + cached.
 */
@Table({ tableName: 'CompanySettings', timestamps: false })
export class CompanySettings extends Model<Partial<CompanySettingsAttributes>, Partial<CompanySettingsAttributes>> {
  @PrimaryKey
  @Default('singleton')
  @Column(DataType.TEXT)
  declare id: string

  /**
   * IANA timezone (e.g. 'America/Chicago', 'Asia/Karachi'). All
   * date/time displays + scheduling in the CRM resolve through this
   * value, regardless of the operator's machine locale.
   */
  @AllowNull(false)
  @Default('America/Chicago')
  @Column(DataType.TEXT)
  declare timezone: string

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface CompanySettingsAttributes {
  id: string
  timezone: string
  createdAt: Date
  updatedAt: Date
}
