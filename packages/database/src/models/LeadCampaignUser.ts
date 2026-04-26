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
import { LeadCampaign } from './LeadCampaign'
import { User } from './User'

/**
 * `LeadCampaignUser` — direct user assignments to a campaign (legacy
 * mapping; UserCampaignAssignment is the role-aware replacement that
 * the UI now uses). This table is still present for the few code paths
 * that expect a flat user list per campaign.
 */
@Table({
  tableName: 'LeadCampaignUser',
  timestamps: false,
  indexes: [
    {
      name: 'LeadCampaignUser_leadCampaignId_userId_key',
      unique: true,
      fields: ['leadCampaignId', 'userId'],
    },
    { name: 'LeadCampaignUser_userId_idx', fields: ['userId'] },
  ],
})
export class LeadCampaignUser extends Model<
  Partial<LeadCampaignUserAttributes>,
  Partial<LeadCampaignUserAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @ForeignKey(() => LeadCampaign)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare leadCampaignId: string

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare userId: string

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date
}

export interface LeadCampaignUserAttributes {
  id: string
  leadCampaignId: string
  userId: string
  createdAt: Date
}
