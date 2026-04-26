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
import { Contact } from './Contact'

/**
 * `Conversation` — message thread between the org and a Contact about
 * a Property. Composite-unique on (propertyId, contactId) so each
 * (property, contact) pair has exactly one thread.
 */
@Table({
  tableName: 'Conversation',
  timestamps: false,
  indexes: [
    {
      name: 'Conversation_propertyId_contactId_key',
      unique: true,
      fields: ['propertyId', 'contactId'],
    },
    { name: 'Conversation_contactId_idx', fields: ['contactId'] },
  ],
})
export class Conversation extends Model<
  Partial<ConversationAttributes>,
  Partial<ConversationAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => Property)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare propertyId: string

  @ForeignKey(() => Contact)
  @Column(DataType.TEXT)
  declare contactId: string | null

  @Column(DataType.TEXT) declare contactPhone: string | null
  @Column(DataType.TEXT) declare contactEmail: string | null

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare isRead: boolean

  @Column(DataType.DATE) declare lastMessageAt: Date | null

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface ConversationAttributes {
  id: string
  propertyId: string
  contactId: string | null
  contactPhone: string | null
  contactEmail: string | null
  isRead: boolean
  lastMessageAt: Date | null
  createdAt: Date
  updatedAt: Date
}
