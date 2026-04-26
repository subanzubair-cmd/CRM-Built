/**
 * Sequelize model registry — barrel file.
 *
 * Order matters: classes that other classes have `@ForeignKey(() => X)`
 * pointing at must be registered first.
 */
import { sequelize } from '../sequelize'

// ── Phase 2: Independent leaf models ────────────────────────────────────────
import { LeadSource } from './LeadSource'
import { TwilioNumber } from './TwilioNumber'
import { Tag } from './Tag'
import { Market } from './Market'
import { AiConfiguration } from './AiConfiguration'
import { GlobalFolder } from './GlobalFolder'
import { GlobalFile } from './GlobalFile'
import { ListStackSource } from './ListStackSource'
import { CommProviderConfig } from './CommProviderConfig'

// ── Phase 3: User & RBAC ────────────────────────────────────────────────────
import { User } from './User'
import { Role } from './Role'
import { UserRoleConfig } from './UserRoleConfig'
import { ApiToken } from './ApiToken'
import { UserCampaignAssignment } from './UserCampaignAssignment'
import { LeadCampaignRoleToggle } from './LeadCampaignRoleToggle'
import { PropertyTeamAssignment } from './PropertyTeamAssignment'

// ── Phase 4: Campaigns & enrollment ─────────────────────────────────────────
import { LeadCampaign } from './LeadCampaign'
import { LeadCampaignUser } from './LeadCampaignUser'
import { Campaign } from './Campaign'
import { CampaignStep } from './CampaignStep'
import { CampaignEnrollment } from './CampaignEnrollment'
import { Automation } from './Automation'
import { AutomationAction } from './AutomationAction'
import { StatusAutomation } from './StatusAutomation'
import { Template } from './Template'
import { DirectMailCampaign } from './DirectMailCampaign'

// ── Phase 5: Contacts & buyer/vendor ────────────────────────────────────────
import { Contact } from './Contact'
import { Buyer } from './Buyer'
import { BuyerCriteria } from './BuyerCriteria'
import { Vendor } from './Vendor'

// ── Phase 6: Property hub ───────────────────────────────────────────────────
import { Property } from './Property'
import { PropertyContact } from './PropertyContact'
import { StageHistory } from './StageHistory'
import { ActivityLog } from './ActivityLog'
import { Note } from './Note'
import { Task } from './Task'
import { Appointment } from './Appointment'
import { BuyerMatch } from './BuyerMatch'
import { BuyerOffer } from './BuyerOffer'
import { LeadOffer } from './LeadOffer'

// ── Phase 7: Conversations & Messages ──────────────────────────────────────
import { Conversation } from './Conversation'
import { Message } from './Message'
import { ActiveCall } from './ActiveCall'
import { Notification } from './Notification'
import { EsignTemplate } from './EsignTemplate'
import { EsignDocument } from './EsignDocument'
import { PropertyFile } from './PropertyFile'

sequelize.addModels([
  // Phase 2 leaves (parents first)
  LeadSource,
  TwilioNumber,
  Tag,
  Market,
  AiConfiguration,
  GlobalFolder,
  GlobalFile,
  ListStackSource,
  CommProviderConfig,

  // Phase 3 RBAC (parents first)
  Role,
  User,
  UserRoleConfig,
  ApiToken,
  UserCampaignAssignment,
  LeadCampaignRoleToggle,
  PropertyTeamAssignment,

  // Phase 4 campaigns (parents first: LeadCampaign before its dependents)
  LeadCampaign,
  LeadCampaignUser,
  Campaign,
  CampaignStep,
  CampaignEnrollment,
  Automation,
  AutomationAction,
  StatusAutomation,
  Template,
  DirectMailCampaign,

  // Phase 5 contacts (Contact before Buyer/Vendor; BuyerCriteria after Buyer)
  Contact,
  Buyer,
  BuyerCriteria,
  Vendor,

  // Phase 6 Property hub (Property before its child join/audit tables)
  Property,
  PropertyContact,
  StageHistory,
  ActivityLog,
  Note,
  Task,
  Appointment,
  BuyerMatch,
  BuyerOffer,
  LeadOffer,

  // Phase 7 Conversations & Messages (Conversation before Message)
  Conversation,
  Message,
  ActiveCall,
  Notification,
  EsignTemplate,
  EsignDocument,
  PropertyFile,
])

// Wire cross-model associations AFTER addModels.
import { wireAssociations } from './_associations'
wireAssociations()

// ── Public re-exports ───────────────────────────────────────────────────────
export {
  // Phase 2
  LeadSource,
  TwilioNumber,
  Tag,
  Market,
  AiConfiguration,
  GlobalFolder,
  GlobalFile,
  ListStackSource,
  CommProviderConfig,
  // Phase 3
  User,
  Role,
  UserRoleConfig,
  ApiToken,
  UserCampaignAssignment,
  LeadCampaignRoleToggle,
  PropertyTeamAssignment,
  // Phase 4
  LeadCampaign,
  LeadCampaignUser,
  Campaign,
  CampaignStep,
  CampaignEnrollment,
  Automation,
  AutomationAction,
  StatusAutomation,
  Template,
  DirectMailCampaign,
  // Phase 5
  Contact,
  Buyer,
  BuyerCriteria,
  Vendor,
  // Phase 6
  Property,
  PropertyContact,
  StageHistory,
  ActivityLog,
  Note,
  Task,
  Appointment,
  BuyerMatch,
  BuyerOffer,
  LeadOffer,
  // Phase 7
  Conversation,
  Message,
  ActiveCall,
  Notification,
  EsignTemplate,
  EsignDocument,
  PropertyFile,
}
