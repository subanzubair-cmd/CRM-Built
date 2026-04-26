/**
 * Centralized association wiring for Sequelize models.
 *
 * Loaded LAST from `models/index.ts` so all classes are already in the
 * Sequelize registry. Append a small block per migrated cluster.
 */
import { GlobalFile } from './GlobalFile'
import { GlobalFolder } from './GlobalFolder'
import { User } from './User'
import { Role } from './Role'
import { UserRoleConfig } from './UserRoleConfig'
import { ApiToken } from './ApiToken'
import { UserCampaignAssignment } from './UserCampaignAssignment'
import { LeadCampaignRoleToggle } from './LeadCampaignRoleToggle'
import { PropertyTeamAssignment } from './PropertyTeamAssignment'
import { LeadCampaign } from './LeadCampaign'
import { LeadCampaignUser } from './LeadCampaignUser'
import { Campaign } from './Campaign'
import { CampaignStep } from './CampaignStep'
import { CampaignEnrollment } from './CampaignEnrollment'
import { Automation } from './Automation'
import { AutomationAction } from './AutomationAction'
import { LeadSource } from './LeadSource'
import { TwilioNumber } from './TwilioNumber'
import { Market } from './Market'
import { Contact } from './Contact'
import { Buyer } from './Buyer'
import { BuyerCriteria } from './BuyerCriteria'
import { Vendor } from './Vendor'

export function wireAssociations(): void {
  // ── Phase 2: Independent leaves ───────────────────────────────────────────
  GlobalFolder.hasMany(GlobalFile, { foreignKey: 'folderId', as: 'files' })
  GlobalFile.belongsTo(GlobalFolder, { foreignKey: 'folderId', as: 'folder' })

  // ── Phase 3: User & RBAC ──────────────────────────────────────────────────
  Role.hasMany(User, { foreignKey: 'roleId', as: 'users' })
  User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' })

  User.hasMany(UserRoleConfig, { foreignKey: 'userId', as: 'roleConfigs' })
  UserRoleConfig.belongsTo(User, { foreignKey: 'userId', as: 'user' })
  Role.hasMany(UserRoleConfig, { foreignKey: 'roleId', as: 'userConfigs' })
  UserRoleConfig.belongsTo(Role, { foreignKey: 'roleId', as: 'role' })

  User.hasMany(ApiToken, { foreignKey: 'userId', as: 'apiTokens' })
  ApiToken.belongsTo(User, { foreignKey: 'userId', as: 'user' })

  User.hasMany(UserCampaignAssignment, {
    foreignKey: 'userId',
    as: 'campaignAssignments',
  })
  UserCampaignAssignment.belongsTo(User, { foreignKey: 'userId', as: 'user' })
  Role.hasMany(UserCampaignAssignment, {
    foreignKey: 'roleId',
    as: 'campaignAssignments',
  })
  UserCampaignAssignment.belongsTo(Role, { foreignKey: 'roleId', as: 'role' })

  Role.hasMany(LeadCampaignRoleToggle, {
    foreignKey: 'roleId',
    as: 'leadCampaignToggles',
  })
  LeadCampaignRoleToggle.belongsTo(Role, { foreignKey: 'roleId', as: 'role' })

  User.hasMany(PropertyTeamAssignment, {
    foreignKey: 'userId',
    as: 'propertyTeamAssignments',
  })
  PropertyTeamAssignment.belongsTo(User, { foreignKey: 'userId', as: 'user' })
  Role.hasMany(PropertyTeamAssignment, {
    foreignKey: 'roleId',
    as: 'propertyTeamAssignments',
  })
  PropertyTeamAssignment.belongsTo(Role, { foreignKey: 'roleId', as: 'role' })

  // ── Phase 4: Campaigns & enrollment ───────────────────────────────────────
  // LeadCampaign 1:1 TwilioNumber (phoneNumberId is unique on LeadCampaign).
  LeadCampaign.belongsTo(TwilioNumber, { foreignKey: 'phoneNumberId', as: 'phoneNumber' })
  TwilioNumber.hasOne(LeadCampaign, { foreignKey: 'phoneNumberId', as: 'leadCampaign' })

  // LeadCampaign N:1 LeadSource.
  LeadCampaign.belongsTo(LeadSource, { foreignKey: 'leadSourceId', as: 'leadSource' })
  LeadSource.hasMany(LeadCampaign, { foreignKey: 'leadSourceId', as: 'leadCampaigns' })

  // LeadCampaign 1:N joins back to Phase 3 children.
  LeadCampaign.hasMany(LeadCampaignRoleToggle, {
    foreignKey: 'leadCampaignId',
    as: 'roleToggles',
  })
  LeadCampaignRoleToggle.belongsTo(LeadCampaign, {
    foreignKey: 'leadCampaignId',
    as: 'leadCampaign',
  })

  LeadCampaign.hasMany(LeadCampaignUser, {
    foreignKey: 'leadCampaignId',
    as: 'assignedUsers',
  })
  LeadCampaignUser.belongsTo(LeadCampaign, {
    foreignKey: 'leadCampaignId',
    as: 'leadCampaign',
  })
  User.hasMany(LeadCampaignUser, {
    foreignKey: 'userId',
    as: 'leadCampaignAssignments',
  })
  LeadCampaignUser.belongsTo(User, { foreignKey: 'userId', as: 'user' })

  LeadCampaign.hasMany(UserCampaignAssignment, {
    foreignKey: 'campaignId',
    as: 'userAssignments',
  })
  UserCampaignAssignment.belongsTo(LeadCampaign, {
    foreignKey: 'campaignId',
    as: 'campaign',
  })

  // Campaign (drip/broadcast) → Market + steps + enrollments.
  Campaign.belongsTo(Market, { foreignKey: 'marketId', as: 'market' })
  Market.hasMany(Campaign, { foreignKey: 'marketId', as: 'campaigns' })

  Campaign.hasMany(CampaignStep, { foreignKey: 'campaignId', as: 'steps' })
  CampaignStep.belongsTo(Campaign, { foreignKey: 'campaignId', as: 'campaign' })

  Campaign.hasMany(CampaignEnrollment, {
    foreignKey: 'campaignId',
    as: 'enrollments',
  })
  CampaignEnrollment.belongsTo(Campaign, {
    foreignKey: 'campaignId',
    as: 'campaign',
  })

  // Automation → AutomationAction.
  Automation.hasMany(AutomationAction, {
    foreignKey: 'automationId',
    as: 'actions',
  })
  AutomationAction.belongsTo(Automation, {
    foreignKey: 'automationId',
    as: 'automation',
  })

  // ── Phase 5: Contacts & buyer/vendor ──────────────────────────────────────
  // Contact 1:1 Buyer / Vendor (contactId is unique on each).
  Contact.hasOne(Buyer, { foreignKey: 'contactId', as: 'buyerProfile' })
  Buyer.belongsTo(Contact, { foreignKey: 'contactId', as: 'contact' })
  Contact.hasOne(Vendor, { foreignKey: 'contactId', as: 'vendorProfile' })
  Vendor.belongsTo(Contact, { foreignKey: 'contactId', as: 'contact' })

  // Buyer 1:N BuyerCriteria.
  Buyer.hasMany(BuyerCriteria, { foreignKey: 'buyerId', as: 'criteria' })
  BuyerCriteria.belongsTo(Buyer, { foreignKey: 'buyerId', as: 'buyer' })
}
