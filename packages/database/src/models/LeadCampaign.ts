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
import { TwilioNumber } from './TwilioNumber'
import { LeadSource } from './LeadSource'
import { LEAD_CAMPAIGN_TYPE_VALUES, LEAD_ASSIGNMENT_METHOD_VALUES } from '../enums'

/**
 * `LeadCampaign` — top-level container for inbound lead routing. Each
 * campaign owns one phone number (`phoneNumberId`, unique), optionally
 * attributes leads to a `LeadSource`, and uses one of three assignment
 * strategies (round-robin / first-to-claim / manual).
 *
 * Phase 4 typing notes:
 *   - `phoneNumberId` is the FK side of a 1:1 with TwilioNumber. The
 *     associations file declares `LeadCampaign.belongsTo(TwilioNumber)`.
 *   - Cross-cluster relations (Property[], Message[], ActiveCall[]) are
 *     wired in their respective phases.
 */
@Table({
  tableName: 'LeadCampaign',
  timestamps: false,
  indexes: [
    { name: 'LeadCampaign_type_idx', fields: ['type'] },
    { name: 'LeadCampaign_leadSourceId_idx', fields: ['leadSourceId'] },
  ],
})
export class LeadCampaign extends Model<
  Partial<LeadCampaignAttributes>,
  Partial<LeadCampaignAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare name: string

  @AllowNull(false)
  @Column(DataType.ENUM(...LEAD_CAMPAIGN_TYPE_VALUES))
  declare type: 'DTS' | 'DTA' | 'BUYER' | 'VENDOR'

  @ForeignKey(() => TwilioNumber)
  @Column(DataType.TEXT)
  declare phoneNumberId: string | null

  @ForeignKey(() => LeadSource)
  @Column(DataType.TEXT)
  declare leadSourceId: string | null

  @Column(DataType.TEXT)
  declare callFlowName: string | null

  @AllowNull(false)
  @Default('ROUND_ROBIN')
  @Column(DataType.ENUM(...LEAD_ASSIGNMENT_METHOD_VALUES))
  declare assignmentMethod: 'ROUND_ROBIN' | 'FIRST_TO_CLAIM' | 'MANUAL'

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date
}

export interface LeadCampaignAttributes {
  id: string
  name: string
  type: 'DTS' | 'DTA' | 'BUYER' | 'VENDOR'
  phoneNumberId: string | null
  leadSourceId: string | null
  callFlowName: string | null
  assignmentMethod: 'ROUND_ROBIN' | 'FIRST_TO_CLAIM' | 'MANUAL'
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
