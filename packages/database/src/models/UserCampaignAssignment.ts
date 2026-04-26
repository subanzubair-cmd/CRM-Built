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
 * `UserCampaignAssignment` — pairs a (user, role) with a specific
 * `LeadCampaign`. Drives per-campaign team membership and the
 * round-robin auto-assignment of new leads.
 *
 * The FK to LeadCampaign is left untyped on the Sequelize side until
 * Phase 4 migrates LeadCampaign — the `campaignId` column is declared
 * here as a plain TEXT so reads/writes work without the association.
 */
@Table({
  tableName: 'UserCampaignAssignment',
  timestamps: false,
  indexes: [
    {
      name: 'UserCampaignAssignment_userId_roleId_campaignId_key',
      unique: true,
      fields: ['userId', 'roleId', 'campaignId'],
    },
    {
      name: 'UserCampaignAssignment_campaignId_roleId_assignNewLeads_idx',
      fields: ['campaignId', 'roleId', 'assignNewLeads'],
    },
  ],
})
export class UserCampaignAssignment extends Model<
  Partial<UserCampaignAssignmentAttributes>,
  Partial<UserCampaignAssignmentAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare userId: string

  @ForeignKey(() => Role)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare roleId: string

  // FK to LeadCampaign — typed as plain TEXT until Phase 4 migrates
  // LeadCampaign. The DB-level FK constraint still enforces integrity.
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare campaignId: string

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare assignNewLeads: boolean

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare backfillExistingLeads: boolean

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface UserCampaignAssignmentAttributes {
  id: string
  userId: string
  roleId: string
  campaignId: string
  assignNewLeads: boolean
  backfillExistingLeads: boolean
  createdAt: Date
  updatedAt: Date
}
