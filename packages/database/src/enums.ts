/**
 * Hand-typed TS unions mirroring Postgres enum types.
 *
 * These exist so that callers can stop importing enum runtime values from
 * `@prisma/client` without losing type safety. The Postgres enum types
 * themselves are unchanged — Sequelize models will reference these unions
 * via `DataType.ENUM(...VALUES)` in the per-model files.
 *
 * KEEP IN SYNC with `packages/database/prisma/schema.prisma` until Phase 10
 * decommissions Prisma. After Phase 10 this file becomes the source of truth.
 */

// ── Lead / pipeline ─────────────────────────────────────────────────────────
export const LeadType = {
  DIRECT_TO_SELLER: 'DIRECT_TO_SELLER',
  DIRECT_TO_AGENT: 'DIRECT_TO_AGENT',
} as const
export type LeadType = (typeof LeadType)[keyof typeof LeadType]
export const LEAD_TYPE_VALUES = Object.values(LeadType) as LeadType[]

export const LeadStatus = {
  ACTIVE: 'ACTIVE',
  WARM: 'WARM',
  DEAD: 'DEAD',
  REFERRED_TO_AGENT: 'REFERRED_TO_AGENT',
} as const
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus]
export const LEAD_STATUS_VALUES = Object.values(LeadStatus) as LeadStatus[]

export const ActiveLeadStage = {
  NEW_LEAD: 'NEW_LEAD',
  DISCOVERY: 'DISCOVERY',
  INTERESTED_ADD_TO_FOLLOW_UP: 'INTERESTED_ADD_TO_FOLLOW_UP',
  VETTED_AGENTS: 'VETTED_AGENTS',
  APPOINTMENT_MADE: 'APPOINTMENT_MADE',
  DUE_DILIGENCE: 'DUE_DILIGENCE',
  OFFER_MADE: 'OFFER_MADE',
  OFFER_FOLLOW_UP: 'OFFER_FOLLOW_UP',
  UNDER_CONTRACT: 'UNDER_CONTRACT',
} as const
export type ActiveLeadStage = (typeof ActiveLeadStage)[keyof typeof ActiveLeadStage]
export const ACTIVE_LEAD_STAGE_VALUES = Object.values(ActiveLeadStage) as ActiveLeadStage[]

export const TmStage = {
  NEW_CONTRACT: 'NEW_CONTRACT',
  MARKETING_TO_BUYERS: 'MARKETING_TO_BUYERS',
  SHOWING_TO_BUYERS: 'SHOWING_TO_BUYERS',
  EVALUATING_OFFERS: 'EVALUATING_OFFERS',
  ACCEPTED_OFFER: 'ACCEPTED_OFFER',
  CLEAR_TO_CLOSE: 'CLEAR_TO_CLOSE',
} as const
export type TmStage = (typeof TmStage)[keyof typeof TmStage]
export const TM_STAGE_VALUES = Object.values(TmStage) as TmStage[]

export const InventoryStage = {
  NEW_INVENTORY: 'NEW_INVENTORY',
  GETTING_ESTIMATES: 'GETTING_ESTIMATES',
  UNDER_REHAB: 'UNDER_REHAB',
  LISTED_FOR_SALE: 'LISTED_FOR_SALE',
  UNDER_CONTRACT: 'UNDER_CONTRACT',
} as const
export type InventoryStage = (typeof InventoryStage)[keyof typeof InventoryStage]
export const INVENTORY_STAGE_VALUES = Object.values(InventoryStage) as InventoryStage[]

export const ExitStrategy = {
  WHOLESALE_ASSIGNMENT: 'WHOLESALE_ASSIGNMENT',
  WHOLESALE_DOUBLE_CLOSE: 'WHOLESALE_DOUBLE_CLOSE',
  INSTALLMENT: 'INSTALLMENT',
  SELLER_FINANCE: 'SELLER_FINANCE',
  FIX_AND_FLIP: 'FIX_AND_FLIP',
  JOINT_VENTURE: 'JOINT_VENTURE',
  NEW_CONSTRUCTION: 'NEW_CONSTRUCTION',
  NOVATION: 'NOVATION',
  PARTNERSHIP: 'PARTNERSHIP',
  PROJECT_MANAGEMENT: 'PROJECT_MANAGEMENT',
  RETAIL_LISTING: 'RETAIL_LISTING',
  SALE_LEASEBACK: 'SALE_LEASEBACK',
  WHOLETAIL: 'WHOLETAIL',
  RENTAL: 'RENTAL',
  TURNKEY: 'TURNKEY',
} as const
export type ExitStrategy = (typeof ExitStrategy)[keyof typeof ExitStrategy]
export const EXIT_STRATEGY_VALUES = Object.values(ExitStrategy) as ExitStrategy[]

export const DispoStage = {
  POTENTIAL_BUYER: 'POTENTIAL_BUYER',
  COLD_BUYER: 'COLD_BUYER',
  WARM_BUYER: 'WARM_BUYER',
  HOT_BUYER: 'HOT_BUYER',
  DISPO_OFFER_RECEIVED: 'DISPO_OFFER_RECEIVED',
  SOLD: 'SOLD',
} as const
export type DispoStage = (typeof DispoStage)[keyof typeof DispoStage]
export const DISPO_STAGE_VALUES = Object.values(DispoStage) as DispoStage[]

export const PropertyStatus = {
  LEAD: 'LEAD',
  UNDER_CONTRACT: 'UNDER_CONTRACT',
  IN_TM: 'IN_TM',
  IN_INVENTORY: 'IN_INVENTORY',
  IN_DISPO: 'IN_DISPO',
  SOLD: 'SOLD',
  RENTAL: 'RENTAL',
  DEAD: 'DEAD',
  WARM: 'WARM',
  REFERRED: 'REFERRED',
} as const
export type PropertyStatus = (typeof PropertyStatus)[keyof typeof PropertyStatus]
export const PROPERTY_STATUS_VALUES = Object.values(PropertyStatus) as PropertyStatus[]

// ── Contacts / messaging ────────────────────────────────────────────────────
export const ContactType = {
  SELLER: 'SELLER',
  BUYER: 'BUYER',
  AGENT: 'AGENT',
  VENDOR: 'VENDOR',
  OTHER: 'OTHER',
} as const
export type ContactType = (typeof ContactType)[keyof typeof ContactType]
export const CONTACT_TYPE_VALUES = Object.values(ContactType) as ContactType[]

export const MessageChannel = {
  SMS: 'SMS',
  CALL: 'CALL',
  RVM: 'RVM',
  EMAIL: 'EMAIL',
  NOTE: 'NOTE',
  SYSTEM: 'SYSTEM',
} as const
export type MessageChannel = (typeof MessageChannel)[keyof typeof MessageChannel]
export const MESSAGE_CHANNEL_VALUES = Object.values(MessageChannel) as MessageChannel[]

export const MessageDirection = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const
export type MessageDirection = (typeof MessageDirection)[keyof typeof MessageDirection]
export const MESSAGE_DIRECTION_VALUES = Object.values(MessageDirection) as MessageDirection[]

// ── Tasks ───────────────────────────────────────────────────────────────────
export const TaskStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]
export const TASK_STATUS_VALUES = Object.values(TaskStatus) as TaskStatus[]

export const TaskType = {
  FOLLOW_UP: 'FOLLOW_UP',
  APPOINTMENT: 'APPOINTMENT',
  OFFER: 'OFFER',
  CALL: 'CALL',
  EMAIL: 'EMAIL',
  OTHER: 'OTHER',
} as const
export type TaskType = (typeof TaskType)[keyof typeof TaskType]
export const TASK_TYPE_VALUES = Object.values(TaskType) as TaskType[]

// ── Campaigns / automation ──────────────────────────────────────────────────
export const CampaignType = {
  DRIP: 'DRIP',
  BROADCAST: 'BROADCAST',
} as const
export type CampaignType = (typeof CampaignType)[keyof typeof CampaignType]
export const CAMPAIGN_TYPE_VALUES = Object.values(CampaignType) as CampaignType[]

export const CampaignStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
} as const
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus]
export const CAMPAIGN_STATUS_VALUES = Object.values(CampaignStatus) as CampaignStatus[]

export const AutomationTrigger = {
  STAGE_CHANGE: 'STAGE_CHANGE',
  LEAD_CREATED: 'LEAD_CREATED',
  TAG_ADDED: 'TAG_ADDED',
  NO_CONTACT_X_DAYS: 'NO_CONTACT_X_DAYS',
  OFFER_MADE: 'OFFER_MADE',
  UNDER_CONTRACT: 'UNDER_CONTRACT',
  MANUAL: 'MANUAL',
} as const
export type AutomationTrigger = (typeof AutomationTrigger)[keyof typeof AutomationTrigger]
export const AUTOMATION_TRIGGER_VALUES = Object.values(AutomationTrigger) as AutomationTrigger[]

export const AutomationActionType = {
  SEND_SMS: 'SEND_SMS',
  SEND_EMAIL: 'SEND_EMAIL',
  SEND_RVM: 'SEND_RVM',
  ADD_TAG: 'ADD_TAG',
  CHANGE_STAGE: 'CHANGE_STAGE',
  ASSIGN_USER: 'ASSIGN_USER',
  CREATE_TASK: 'CREATE_TASK',
  ENROLL_CAMPAIGN: 'ENROLL_CAMPAIGN',
} as const
export type AutomationActionType = (typeof AutomationActionType)[keyof typeof AutomationActionType]
export const AUTOMATION_ACTION_TYPE_VALUES = Object.values(AutomationActionType) as AutomationActionType[]

// ── Files ───────────────────────────────────────────────────────────────────
export const FileType = {
  DOCUMENT: 'DOCUMENT',
  IMAGE: 'IMAGE',
  CONTRACT: 'CONTRACT',
  INSPECTION: 'INSPECTION',
  PHOTO: 'PHOTO',
  OTHER: 'OTHER',
} as const
export type FileType = (typeof FileType)[keyof typeof FileType]
export const FILE_TYPE_VALUES = Object.values(FileType) as FileType[]

// ── User / system ───────────────────────────────────────────────────────────
export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  INVITED: 'INVITED',
} as const
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus]
export const USER_STATUS_VALUES = Object.values(UserStatus) as UserStatus[]

export const NotificationType = {
  NEW_LEAD: 'NEW_LEAD',
  MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
  TASK_DUE: 'TASK_DUE',
  STAGE_CHANGE: 'STAGE_CHANGE',
  MENTION: 'MENTION',
  SYSTEM: 'SYSTEM',
} as const
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType]
export const NOTIFICATION_TYPE_VALUES = Object.values(NotificationType) as NotificationType[]

export const WebhookEventStatus = {
  PENDING: 'PENDING',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
} as const
export type WebhookEventStatus = (typeof WebhookEventStatus)[keyof typeof WebhookEventStatus]
export const WEBHOOK_EVENT_STATUS_VALUES = Object.values(WebhookEventStatus) as WebhookEventStatus[]

export const AiEngine = {
  TEXT_CONVERSATIONAL: 'TEXT_CONVERSATIONAL',
  LEAD_SUMMARIZATION: 'LEAD_SUMMARIZATION',
  HOT_LEAD_DETECTION: 'HOT_LEAD_DETECTION',
  VOICE_CONVERSATIONAL: 'VOICE_CONVERSATIONAL',
  DRIP_PERSONALIZATION: 'DRIP_PERSONALIZATION',
} as const
export type AiEngine = (typeof AiEngine)[keyof typeof AiEngine]
export const AI_ENGINE_VALUES = Object.values(AiEngine) as AiEngine[]

// ── Lead campaigns ──────────────────────────────────────────────────────────
export const LeadCampaignType = {
  DTS: 'DTS',
  DTA: 'DTA',
  BUYER: 'BUYER',
  VENDOR: 'VENDOR',
} as const
export type LeadCampaignType = (typeof LeadCampaignType)[keyof typeof LeadCampaignType]
export const LEAD_CAMPAIGN_TYPE_VALUES = Object.values(LeadCampaignType) as LeadCampaignType[]

export const LeadAssignmentMethod = {
  ROUND_ROBIN: 'ROUND_ROBIN',
  FIRST_TO_CLAIM: 'FIRST_TO_CLAIM',
  MANUAL: 'MANUAL',
} as const
export type LeadAssignmentMethod = (typeof LeadAssignmentMethod)[keyof typeof LeadAssignmentMethod]
export const LEAD_ASSIGNMENT_METHOD_VALUES = Object.values(LeadAssignmentMethod) as LeadAssignmentMethod[]

// ── Workspace / templates (lowercase enum values to match schema) ───────────
export const WorkspaceType = {
  leads: 'leads',
  tm: 'tm',
  inventory: 'inventory',
  sold: 'sold',
  rental: 'rental',
} as const
export type WorkspaceType = (typeof WorkspaceType)[keyof typeof WorkspaceType]
export const WORKSPACE_TYPE_VALUES = Object.values(WorkspaceType) as WorkspaceType[]

export const TemplateType = {
  sms: 'sms',
  email: 'email',
  rvm: 'rvm',
  task: 'task',
  direct_mail: 'direct_mail',
} as const
export type TemplateType = (typeof TemplateType)[keyof typeof TemplateType]
export const TEMPLATE_TYPE_VALUES = Object.values(TemplateType) as TemplateType[]
