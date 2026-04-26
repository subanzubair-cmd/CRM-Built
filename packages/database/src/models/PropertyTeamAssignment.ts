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
import { User } from './User'
import { Role } from './Role'

/**
 * `PropertyTeamAssignment` — which (user, role) is on the team for a
 * given lead/property. Composite-unique on (propertyId, roleId) so each
 * role has at most one holder per property.
 *
 * The FK to Property is left untyped until Phase 6 migrates Property.
 */
@Table({
  tableName: 'PropertyTeamAssignment',
  timestamps: false,
  indexes: [
    {
      name: 'PropertyTeamAssignment_propertyId_roleId_key',
      unique: true,
      fields: ['propertyId', 'roleId'],
    },
    { name: 'PropertyTeamAssignment_userId_idx', fields: ['userId'] },
    { name: 'PropertyTeamAssignment_propertyId_idx', fields: ['propertyId'] },
  ],
})
export class PropertyTeamAssignment extends Model<
  Partial<PropertyTeamAssignmentAttributes>,
  Partial<PropertyTeamAssignmentAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  // FK to Property — Phase 6 will add the typed association.
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare propertyId: string

  @ForeignKey(() => Role)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare roleId: string

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare userId: string

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface PropertyTeamAssignmentAttributes {
  id: string
  propertyId: string
  roleId: string
  userId: string
  createdAt: Date
  updatedAt: Date
}
