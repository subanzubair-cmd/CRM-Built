/**
 * @crm/database — dual-export hub during the Prisma → Sequelize migration.
 *
 * Three groups of exports:
 *   1. Prisma runtime + types — unchanged. Removed in Phase 10.
 *   2. Sequelize singleton + (eventually) model classes from `./models`.
 *   3. TS-union enums (decoupled from Prisma's generated runtime), so
 *      callers don't have to import from `@prisma/client`.
 *
 * Migrated clusters export their model class from `./models` and that class
 * shadows the Prisma type name (e.g. `User`) — call sites that did
 * `import type { User }` keep working.
 */

// ── Group 1: Prisma (until Phase 10) ────────────────────────────────────────
export { PrismaClient, Prisma } from '../node_modules/.prisma/client'

// Prisma row-shape types — used as `import type` at call sites. These
// disappear cluster-by-cluster as their model gets replaced by a Sequelize
// class (which IS both the runtime and the type).
export type {
  User, Role, Market, Property, Contact, PropertyContact,
  StageHistory, Conversation, Message, Note, Task, Appointment,
  Campaign, CampaignStep, CampaignEnrollment, Automation, AutomationAction,
  Buyer, BuyerCriteria, BuyerMatch, BuyerOffer, Vendor,
  PropertyFile, EsignDocument, Notification, ActivityLog,
  SavedFilter, AiLog, WebhookEvent, TwilioNumber, ListStackSource,
} from '../node_modules/.prisma/client'

// Prisma's runtime enums — kept for backwards compat. Prefer importing the
// equivalents from `./enums` in new code.
export {
  LeadType, LeadStatus, ActiveLeadStage, TmStage, InventoryStage,
  ExitStrategy, PropertyStatus, ContactType, MessageChannel, MessageDirection,
  TaskStatus, TaskType, CampaignType, CampaignStatus, AutomationTrigger,
  AutomationActionType, FileType, UserStatus, NotificationType,
  WebhookEventStatus, AiEngine,
} from '../node_modules/.prisma/client'

// ── Group 2: Sequelize ──────────────────────────────────────────────────────
export { sequelize, pingDatabase, registerSequelizeModel } from './sequelize'
// Re-export migrated model classes from the registry barrel. As clusters
// migrate, this line picks up the new exports automatically.
export * from './models'

// ── Group 3: TS-union enums (Sequelize-friendly, no Prisma dep) ─────────────
// Renamed exports avoid clashing with Group 1's Prisma enum runtime values.
// Use these in NEW code:
export {
  LEAD_TYPE_VALUES,
  LEAD_STATUS_VALUES,
  ACTIVE_LEAD_STAGE_VALUES,
  TM_STAGE_VALUES,
  INVENTORY_STAGE_VALUES,
  EXIT_STRATEGY_VALUES,
  DISPO_STAGE_VALUES,
  PROPERTY_STATUS_VALUES,
  CONTACT_TYPE_VALUES,
  MESSAGE_CHANNEL_VALUES,
  MESSAGE_DIRECTION_VALUES,
  TASK_STATUS_VALUES,
  TASK_TYPE_VALUES,
  CAMPAIGN_TYPE_VALUES,
  CAMPAIGN_STATUS_VALUES,
  AUTOMATION_TRIGGER_VALUES,
  AUTOMATION_ACTION_TYPE_VALUES,
  FILE_TYPE_VALUES,
  USER_STATUS_VALUES,
  NOTIFICATION_TYPE_VALUES,
  WEBHOOK_EVENT_STATUS_VALUES,
  AI_ENGINE_VALUES,
  LEAD_CAMPAIGN_TYPE_VALUES,
  LEAD_ASSIGNMENT_METHOD_VALUES,
  WORKSPACE_TYPE_VALUES,
  TEMPLATE_TYPE_VALUES,
  // Renamed runtime enums (object-shaped) to avoid colliding with Group 1.
  LeadCampaignType,
  LeadAssignmentMethod,
  WorkspaceType,
  TemplateType,
  // Type-only exports re-exported under different names; consumers can
  // pick either Prisma's runtime or the TS-union version.
} from './enums'

// Migration runner — exposed so apps/api can call `migrateUp()` at boot
// in production deploys (Umzug owns DDL post-Phase-1).
export { migrateUp, migrateStatus, umzug, bootstrapFromPrismaHistory } from './migrations-umzug/umzug'
