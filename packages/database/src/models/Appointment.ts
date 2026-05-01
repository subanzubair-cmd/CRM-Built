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

/**
 * `Appointment` — calendar entry tied to a Property. `attendees` is a
 * Postgres TEXT[] of User IDs (not a relation table). `googleEventId`
 * is set when synced to Google Calendar.
 */
@Table({ tableName: 'Appointment', timestamps: false })
export class Appointment extends Model<
  Partial<AppointmentAttributes>,
  Partial<AppointmentAttributes>
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
  declare title: string

  @Column(DataType.TEXT)
  declare description: string | null

  @AllowNull(false)
  @Column(DataType.DATE)
  declare startAt: Date

  @AllowNull(false)
  @Column(DataType.DATE)
  declare endAt: Date

  @Column(DataType.TEXT)
  declare location: string | null

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare attendees: string[]

  @Column(DataType.TEXT)
  declare googleEventId: string | null

  @Column(DataType.TEXT)
  declare outcome: 'KEPT' | 'NOT_KEPT' | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface AppointmentAttributes {
  id: string
  propertyId: string
  title: string
  description: string | null
  startAt: Date
  endAt: Date
  location: string | null
  attendees: string[]
  googleEventId: string | null
  outcome: 'KEPT' | 'NOT_KEPT' | null
  createdAt: Date
  updatedAt: Date
}
