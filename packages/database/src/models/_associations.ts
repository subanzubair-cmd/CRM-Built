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
import { Conversation } from './Conversation'
import { Message } from './Message'
import { ActiveCall } from './ActiveCall'
import { Notification } from './Notification'
import { EsignTemplate } from './EsignTemplate'
import { EsignDocument } from './EsignDocument'
import { PropertyFile } from './PropertyFile'
import { AiLog } from './AiLog'
import { SavedFilter } from './SavedFilter'
import { FinancialGoal } from './FinancialGoal'
import { FinancialAccount } from './FinancialAccount'
import { FinancialTransaction } from './FinancialTransaction'
import { AccountTag } from './AccountTag'
import { BulkSmsBlast } from './BulkSmsBlast'
import { BulkSmsBlastRecipient } from './BulkSmsBlastRecipient'
import { SavedFilterFolder } from './SavedFilterFolder'
import { SavedFilterShare } from './SavedFilterShare'
import { ImportJob } from './ImportJob'
import { ImportJobRow } from './ImportJobRow'

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

  // ── Phase 6: Property hub ─────────────────────────────────────────────────
  Property.belongsTo(Market, { foreignKey: 'marketId', as: 'market' })
  Market.hasMany(Property, { foreignKey: 'marketId', as: 'properties' })

  Property.belongsTo(User, { foreignKey: 'assignedToId', as: 'assignedTo' })
  Property.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' })
  Property.belongsTo(User, { foreignKey: 'dispoAssigneeId', as: 'dispoAssignee' })
  User.hasMany(Property, { foreignKey: 'assignedToId', as: 'assignedProperties' })
  User.hasMany(Property, { foreignKey: 'createdById', as: 'createdProperties' })
  User.hasMany(Property, { foreignKey: 'dispoAssigneeId', as: 'dispoProperties' })

  Property.belongsTo(LeadCampaign, { foreignKey: 'leadCampaignId', as: 'leadCampaign' })
  LeadCampaign.hasMany(Property, { foreignKey: 'leadCampaignId', as: 'properties' })

  // Property 1:N children.
  Property.hasMany(PropertyContact, { foreignKey: 'propertyId', as: 'contacts' })
  PropertyContact.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })
  Contact.hasMany(PropertyContact, { foreignKey: 'contactId', as: 'properties' })
  PropertyContact.belongsTo(Contact, { foreignKey: 'contactId', as: 'contact' })

  Property.hasMany(StageHistory, { foreignKey: 'propertyId', as: 'stageHistory' })
  StageHistory.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

  Property.hasMany(ActivityLog, { foreignKey: 'propertyId', as: 'activityLogs' })
  ActivityLog.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })
  User.hasMany(ActivityLog, { foreignKey: 'userId', as: 'activityLogs' })
  ActivityLog.belongsTo(User, { foreignKey: 'userId', as: 'user' })

  Property.hasMany(Note, { foreignKey: 'propertyId', as: 'notes' })
  Note.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

  Property.hasMany(Task, { foreignKey: 'propertyId', as: 'tasks' })
  Task.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })
  User.hasMany(Task, { foreignKey: 'assignedToId', as: 'assignedTasks' })
  Task.belongsTo(User, { foreignKey: 'assignedToId', as: 'assignedTo' })
  User.hasMany(Task, { foreignKey: 'createdById', as: 'createdTasks' })
  Task.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' })

  Property.hasMany(Appointment, { foreignKey: 'propertyId', as: 'appointments' })
  Appointment.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

  Property.hasMany(BuyerMatch, { foreignKey: 'propertyId', as: 'buyerMatches' })
  BuyerMatch.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })
  Buyer.hasMany(BuyerMatch, { foreignKey: 'buyerId', as: 'matches' })
  BuyerMatch.belongsTo(Buyer, { foreignKey: 'buyerId', as: 'buyer' })

  Property.hasMany(BuyerOffer, { foreignKey: 'propertyId', as: 'offers' })
  BuyerOffer.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })
  Buyer.hasMany(BuyerOffer, { foreignKey: 'buyerId', as: 'offers' })
  BuyerOffer.belongsTo(Buyer, { foreignKey: 'buyerId', as: 'buyer' })

  Property.hasMany(LeadOffer, { foreignKey: 'propertyId', as: 'leadOffers' })
  LeadOffer.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

  // Tie back the deferred Phase-3/4 sides that pointed at Property.
  Property.hasMany(PropertyTeamAssignment, {
    foreignKey: 'propertyId',
    as: 'teamAssignments',
  })
  PropertyTeamAssignment.belongsTo(Property, {
    foreignKey: 'propertyId',
    as: 'property',
  })

  Property.hasMany(CampaignEnrollment, {
    foreignKey: 'propertyId',
    as: 'campaignEnrollments',
  })
  CampaignEnrollment.belongsTo(Property, {
    foreignKey: 'propertyId',
    as: 'property',
  })

  // ── Phase 7: Conversations & Messages ────────────────────────────────────
  // Conversation per (Property, Contact) pair.
  Property.hasMany(Conversation, { foreignKey: 'propertyId', as: 'conversations' })
  Conversation.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })
  Contact.hasMany(Conversation, { foreignKey: 'contactId', as: 'conversations' })
  Conversation.belongsTo(Contact, { foreignKey: 'contactId', as: 'contact' })

  // Message belongs to a Conversation, optionally to Property/Contact/User.
  Conversation.hasMany(Message, { foreignKey: 'conversationId', as: 'messages' })
  Message.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' })
  Property.hasMany(Message, { foreignKey: 'propertyId', as: 'messages' })
  Message.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })
  User.hasMany(Message, { foreignKey: 'sentById', as: 'sentMessages' })
  Message.belongsTo(User, { foreignKey: 'sentById', as: 'sentBy' })
  Contact.hasMany(Message, { foreignKey: 'contactId', as: 'messages' })
  Message.belongsTo(Contact, { foreignKey: 'contactId', as: 'contact' })
  LeadCampaign.hasMany(Message, { foreignKey: 'leadCampaignId', as: 'messages' })
  Message.belongsTo(LeadCampaign, { foreignKey: 'leadCampaignId', as: 'leadCampaign' })

  // ActiveCall — Twilio conference rows.
  Property.hasMany(ActiveCall, { foreignKey: 'propertyId', as: 'activeCalls' })
  ActiveCall.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })
  LeadCampaign.hasMany(ActiveCall, { foreignKey: 'leadCampaignId', as: 'activeCalls' })
  ActiveCall.belongsTo(LeadCampaign, { foreignKey: 'leadCampaignId', as: 'leadCampaign' })
  User.hasMany(ActiveCall, { foreignKey: 'agentUserId', as: 'agentActiveCalls' })
  ActiveCall.belongsTo(User, { foreignKey: 'agentUserId', as: 'agent' })

  // Notification.
  User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' })
  Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' })

  // E-sign template + document.
  EsignTemplate.hasMany(EsignDocument, { foreignKey: 'templateId', as: 'documents' })
  EsignDocument.belongsTo(EsignTemplate, { foreignKey: 'templateId', as: 'template' })
  Property.hasMany(EsignDocument, { foreignKey: 'propertyId', as: 'esignDocuments' })
  EsignDocument.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

  // PropertyFile.
  Property.hasMany(PropertyFile, { foreignKey: 'propertyId', as: 'files' })
  PropertyFile.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

  // ── Phase 8: Logs & analytics ─────────────────────────────────────────────
  Property.hasMany(AiLog, { foreignKey: 'propertyId', as: 'aiLogs' })
  AiLog.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

  User.hasMany(SavedFilter, { foreignKey: 'userId', as: 'savedFilters' })
  SavedFilter.belongsTo(User, { foreignKey: 'userId', as: 'user' })

  User.hasMany(FinancialGoal, { foreignKey: 'userId', as: 'financialGoals' })
  FinancialGoal.belongsTo(User, { foreignKey: 'userId', as: 'user' })

  FinancialAccount.hasMany(FinancialTransaction, {
    foreignKey: 'accountId',
    as: 'transactions',
  })
  FinancialTransaction.belongsTo(FinancialAccount, {
    foreignKey: 'accountId',
    as: 'account',
  })
  AccountTag.hasMany(FinancialTransaction, {
    foreignKey: 'categoryId',
    as: 'transactions',
  })
  FinancialTransaction.belongsTo(AccountTag, {
    foreignKey: 'categoryId',
    as: 'category',
  })

  // ── Phase 9: Bulk SMS broadcast + filter folders + CSV import ─────────────
  BulkSmsBlast.hasMany(BulkSmsBlastRecipient, {
    foreignKey: 'blastId',
    as: 'recipients',
  })
  BulkSmsBlastRecipient.belongsTo(BulkSmsBlast, {
    foreignKey: 'blastId',
    as: 'blast',
  })

  // SavedFilter ↔ folder is a soft FK (no FK constraint at the DB
  // level so deleting a folder leaves filters orphaned + visible as
  // Individual). We still wire the association so includes work.
  SavedFilterFolder.hasMany(SavedFilter, {
    foreignKey: 'folderId',
    as: 'filters',
    constraints: false,
  })
  SavedFilter.belongsTo(SavedFilterFolder, {
    foreignKey: 'folderId',
    as: 'folder',
    constraints: false,
  })

  SavedFilter.hasMany(SavedFilterShare, {
    foreignKey: 'savedFilterId',
    as: 'shares',
  })
  SavedFilterShare.belongsTo(SavedFilter, {
    foreignKey: 'savedFilterId',
    as: 'savedFilter',
  })

  ImportJob.hasMany(ImportJobRow, {
    foreignKey: 'jobId',
    as: 'rows',
  })
  ImportJobRow.belongsTo(ImportJob, {
    foreignKey: 'jobId',
    as: 'job',
  })
}
