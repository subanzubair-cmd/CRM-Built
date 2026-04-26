import {
  Table, Column, Model, DataType, AllowNull, Default, PrimaryKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'

/** Outbound webhook subscription. `events` is a Postgres TEXT[] array. */
@Table({ tableName: 'Webhook', timestamps: false })
export class Webhook extends Model<Partial<WebhookAttributes>, Partial<WebhookAttributes>> {
  @PrimaryKey @Default(newCuid) @Column(DataType.TEXT) declare id: string
  @AllowNull(false) @Column(DataType.TEXT) declare friendlyName: string
  @AllowNull(false) @Default('active') @Column(DataType.TEXT) declare state: string
  @AllowNull(false) @Column(DataType.TEXT) declare endpointUrl: string

  @AllowNull(false) @Default([]) @Column(DataType.ARRAY(DataType.TEXT))
  declare events: string[]

  @Column(DataType.TEXT) declare secretHash: string | null

  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare createdAt: Date
  @AllowNull(false) @Default(DataType.NOW) @Column(DataType.DATE) declare updatedAt: Date
}

export interface WebhookAttributes {
  id: string
  friendlyName: string
  state: string
  endpointUrl: string
  events: string[]
  secretHash: string | null
  createdAt: Date
  updatedAt: Date
}
