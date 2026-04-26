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
 * `DirectMailCampaign` — physical mail send batches. The `templateId`
 * is a free-form FK (not strictly enforced — the original Prisma schema
 * left it untyped).
 */
@Table({ tableName: 'DirectMailCampaign', timestamps: false })
export class DirectMailCampaign extends Model<
  Partial<DirectMailCampaignAttributes>,
  Partial<DirectMailCampaignAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare name: string

  @AllowNull(false)
  @Default('draft')
  @Column(DataType.TEXT)
  declare status: string

  @Column(DataType.DATE)
  declare sendDate: Date | null

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare recipients: number

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare delivered: number

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare returned: number

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

export interface DirectMailCampaignAttributes {
  id: string
  name: string
  status: string
  sendDate: Date | null
  recipients: number
  delivered: number
  returned: number
  templateId: string | null
  createdAt: Date
  updatedAt: Date
}
