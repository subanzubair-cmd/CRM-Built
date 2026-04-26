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
import { Role } from './Role'

/**
 * `LeadCampaignRoleToggle` — per-campaign on/off for each Role. When a
 * lead is created on a campaign, only roles with `enabled = true` get
 * a slot in `PropertyTeamAssignment`.
 *
 * The FK to LeadCampaign is left untyped here until Phase 4 migrates
 * LeadCampaign.
 */
@Table({
  tableName: 'LeadCampaignRoleToggle',
  timestamps: false,
  indexes: [
    {
      name: 'LeadCampaignRoleToggle_leadCampaignId_roleId_key',
      unique: true,
      fields: ['leadCampaignId', 'roleId'],
    },
  ],
})
export class LeadCampaignRoleToggle extends Model<
  Partial<LeadCampaignRoleToggleAttributes>,
  Partial<LeadCampaignRoleToggleAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  // FK to LeadCampaign — Phase 4 will add the typed association.
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare leadCampaignId: string

  @ForeignKey(() => Role)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare roleId: string

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare enabled: boolean
}

export interface LeadCampaignRoleToggleAttributes {
  id: string
  leadCampaignId: string
  roleId: string
  enabled: boolean
}
