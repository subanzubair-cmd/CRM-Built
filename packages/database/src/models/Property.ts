import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  Default,
  PrimaryKey,
  Unique,
  ForeignKey,
} from 'sequelize-typescript'
import { newCuid } from './_id'
import { Market } from './Market'
import { User } from './User'
import { LeadCampaign } from './LeadCampaign'
import {
  LEAD_TYPE_VALUES,
  LEAD_STATUS_VALUES,
  PROPERTY_STATUS_VALUES,
  EXIT_STRATEGY_VALUES,
} from '../enums'

/**
 * `Property` — the central record around which every pipeline orbits.
 * One Property row backs DTS leads, DTA leads, TM, Inventory, Dispo,
 * Sold, Rental, Dead, Warm, and Referred — the `propertyStatus` enum
 * routes it between pipelines.
 *
 * Decimal getter shim: every monetary / numeric Decimal column has a
 * `get()` that coerces the Postgres NUMERIC string to a JS number so
 * existing call sites can keep doing math without per-site `.toNumber()`.
 */
function decimal(precision: number, scale: number, fieldName: string) {
  // Helper to keep the per-column shim readable.
  return {
    type: DataType.DECIMAL(precision, scale),
    get(this: any) {
      const v = this.getDataValue(fieldName)
      return v == null ? null : Number(v)
    },
  }
}

@Table({
  tableName: 'Property',
  timestamps: false,
})
export class Property extends Model<
  Partial<PropertyAttributes>,
  Partial<PropertyAttributes>
> {
  @PrimaryKey
  @Default(newCuid)
  @Column(DataType.TEXT)
  declare id: string

  // ── Address ───────────────────────────────────────────────────────────────
  @Column(DataType.TEXT) declare streetAddress: string | null
  @Column(DataType.TEXT) declare city: string | null
  @Column(DataType.TEXT) declare state: string | null
  @Column(DataType.TEXT) declare zip: string | null
  @Column(DataType.TEXT) declare county: string | null
  @Column(DataType.TEXT) declare normalizedAddress: string | null

  // ── Property attributes ───────────────────────────────────────────────────
  @Column(DataType.INTEGER) declare bedrooms: number | null
  @Column(decimal(4, 1, 'bathrooms')) declare bathrooms: number | null
  @Column(DataType.INTEGER) declare sqft: number | null
  @Column(DataType.INTEGER) declare yearBuilt: number | null
  @Column(decimal(10, 2, 'lotSize')) declare lotSize: number | null
  @Column(DataType.TEXT) declare propertyType: string | null

  // ── Pipeline placement ────────────────────────────────────────────────────
  @AllowNull(false)
  @Column(DataType.ENUM(...LEAD_TYPE_VALUES))
  declare leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'

  @AllowNull(false)
  @Default('ACTIVE')
  @Column(DataType.ENUM(...LEAD_STATUS_VALUES))
  declare leadStatus: 'ACTIVE' | 'WARM' | 'DEAD' | 'REFERRED_TO_AGENT'

  @AllowNull(false)
  @Default('LEAD')
  @Column(DataType.ENUM(...PROPERTY_STATUS_VALUES))
  declare propertyStatus:
    | 'LEAD'
    | 'UNDER_CONTRACT'
    | 'IN_TM'
    | 'IN_INVENTORY'
    | 'IN_DISPO'
    | 'SOLD'
    | 'RENTAL'
    | 'DEAD'
    | 'WARM'
    | 'REFERRED'

  @Column(DataType.TEXT)
  declare activeLeadStage: string | null

  @Column(DataType.ENUM(...EXIT_STRATEGY_VALUES))
  declare exitStrategy: typeof EXIT_STRATEGY_VALUES[number] | null

  // ── Flags ─────────────────────────────────────────────────────────────────
  @AllowNull(false) @Default(false) @Column(DataType.BOOLEAN) declare isHot: boolean
  @AllowNull(false) @Default(false) @Column(DataType.BOOLEAN) declare isFavorited: boolean
  @AllowNull(false) @Default(true) @Column(DataType.BOOLEAN) declare isOpen: boolean

  // ── Money columns ─────────────────────────────────────────────────────────
  @Column(decimal(12, 2, 'askingPrice')) declare askingPrice: number | null
  @Column(decimal(12, 2, 'offerPrice')) declare offerPrice: number | null
  @Column(decimal(12, 2, 'soldPrice')) declare soldPrice: number | null
  @Column(decimal(12, 2, 'arv')) declare arv: number | null
  @Column(decimal(12, 2, 'repairEstimate')) declare repairEstimate: number | null

  // ── TM / Inventory / Dispo ───────────────────────────────────────────────
  @Column(DataType.TEXT)
  declare tmStage: string | null

  @Column(DataType.TEXT)
  declare inventoryStage: string | null

  @AllowNull(false) @Default(false) @Column(DataType.BOOLEAN) declare inDispo: boolean
  @Column(DataType.DATE) declare soldAt: Date | null
  @Column(DataType.DATE) declare rentalAt: Date | null

  // ── FKs ──────────────────────────────────────────────────────────────────
  @ForeignKey(() => Market)
  @Column(DataType.TEXT)
  declare marketId: string | null

  @ForeignKey(() => User)
  @Column(DataType.TEXT)
  declare assignedToId: string | null

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare createdById: string

  @Column(DataType.TEXT) declare source: string | null
  @Column(DataType.TEXT) declare campaignName: string | null

  @ForeignKey(() => LeadCampaign)
  @Column(DataType.TEXT)
  declare leadCampaignId: string | null

  @Column(DataType.TEXT) declare aiSummary: string | null

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare tags: string[]

  // ── Contract / offer details ─────────────────────────────────────────────
  @Column(DataType.DATE) declare contractDate: Date | null
  @Column(DataType.TEXT) declare offerType: string | null
  @Column(DataType.DATE) declare offerDate: Date | null
  @Column(decimal(12, 2, 'expectedProfit')) declare expectedProfit: number | null
  @Column(DataType.DATE) declare expectedProfitDate: Date | null
  @Column(decimal(12, 2, 'contractPrice')) declare contractPrice: number | null
  @Column(DataType.DATE) declare scheduledClosingDate: Date | null
  @Column(DataType.TEXT) declare contingencies: string | null

  @Unique
  @Column(DataType.TEXT)
  declare leadNumber: string | null

  @Column(DataType.TEXT) declare occupancyStatus: string | null
  @Column(DataType.TEXT) declare propertyCondition: string | null

  // ── Timestamps ───────────────────────────────────────────────────────────
  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare createdAt: Date

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  declare updatedAt: Date

  @Column(DataType.DATE) declare lastActivityAt: Date | null

  // ── Dispo / scoring / lifecycle ──────────────────────────────────────────
  @ForeignKey(() => User)
  @Column(DataType.TEXT)
  declare dispoAssigneeId: string | null

  @Column(DataType.INTEGER) declare leadScore: number | null
  @Column(decimal(12, 2, 'underContractPrice')) declare underContractPrice: number | null
  @Column(DataType.DATE) declare deadAt: Date | null
  @Column(DataType.DATE) declare warmAt: Date | null
  @Column(DataType.DATE) declare referredAt: Date | null
  @Column(DataType.DATE) declare underContractAt: Date | null

  @AllowNull(false) @Default(1) @Column(DataType.INTEGER) declare versionNo: number

  @Column(decimal(12, 2, 'estimatedValue')) declare estimatedValue: number | null

  @Column(DataType.JSONB) declare valuationJson: Record<string, unknown> | null
  @Column(DataType.JSONB) declare mortgageInfoJson: Record<string, unknown> | null
  @Column(DataType.JSONB) declare taxInfoJson: Record<string, unknown> | null

  @Column(DataType.TEXT) declare garageType: string | null
  @Column(DataType.INTEGER) declare garageArea: number | null
  @Column(DataType.TEXT) declare apn: string | null
  @Column(DataType.TEXT) declare defaultOutboundNumber: string | null

  // Dead-lead capture columns. Populated by the dead-reason modal when
  // leadStatus transitions to DEAD; cleared (back to []/null) on
  // reactivation. The free-text in `deadOtherReason` is stored verbatim.
  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare deadReasons: string[]

  @Column(DataType.TEXT)
  declare deadOtherReason: string | null
}

export interface PropertyAttributes {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  county: string | null
  normalizedAddress: string | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  yearBuilt: number | null
  lotSize: number | null
  propertyType: string | null
  leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
  leadStatus: 'ACTIVE' | 'WARM' | 'DEAD' | 'REFERRED_TO_AGENT'
  propertyStatus:
    | 'LEAD'
    | 'UNDER_CONTRACT'
    | 'IN_TM'
    | 'IN_INVENTORY'
    | 'IN_DISPO'
    | 'SOLD'
    | 'RENTAL'
    | 'DEAD'
    | 'WARM'
    | 'REFERRED'
  activeLeadStage: string | null
  exitStrategy: typeof EXIT_STRATEGY_VALUES[number] | null
  isHot: boolean
  isFavorited: boolean
  isOpen: boolean
  askingPrice: number | null
  offerPrice: number | null
  soldPrice: number | null
  arv: number | null
  repairEstimate: number | null
  tmStage: string | null
  inventoryStage: string | null
  inDispo: boolean
  soldAt: Date | null
  rentalAt: Date | null
  marketId: string | null
  assignedToId: string | null
  createdById: string
  source: string | null
  campaignName: string | null
  leadCampaignId: string | null
  aiSummary: string | null
  tags: string[]
  contractDate: Date | null
  offerType: string | null
  offerDate: Date | null
  expectedProfit: number | null
  expectedProfitDate: Date | null
  contractPrice: number | null
  scheduledClosingDate: Date | null
  contingencies: string | null
  leadNumber: string | null
  occupancyStatus: string | null
  propertyCondition: string | null
  createdAt: Date
  updatedAt: Date
  lastActivityAt: Date | null
  dispoAssigneeId: string | null
  leadScore: number | null
  underContractPrice: number | null
  deadAt: Date | null
  warmAt: Date | null
  referredAt: Date | null
  underContractAt: Date | null
  versionNo: number
  estimatedValue: number | null
  valuationJson: Record<string, unknown> | null
  mortgageInfoJson: Record<string, unknown> | null
  taxInfoJson: Record<string, unknown> | null
  garageType: string | null
  garageArea: number | null
  apn: string | null
  defaultOutboundNumber: string | null
  deadReasons: string[]
  deadOtherReason: string | null
}
