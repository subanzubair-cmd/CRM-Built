/**
 * @crm/database — Sequelize is now the only ORM in the project.
 *
 * Two groups of exports:
 *   1. Sequelize singleton + every model class (re-exported from `./models`).
 *   2. TS-union enums (Postgres-shaped runtime objects + value lists) so
 *      callers can stop importing enum values from `@prisma/client` (which
 *      has been removed).
 *
 * Prisma is fully decommissioned as of the post-batch-17 cutover.
 */

// ── Sequelize ──────────────────────────────────────────────────────────────
export { sequelize, pingDatabase, registerSequelizeModel } from './sequelize'
export * from './models'

// Re-export common Sequelize query helpers + types so app code can import
// them from `@crm/database` (matching how it imports the model classes).
export { Op, fn, col, literal, where, cast, QueryTypes } from 'sequelize'
export type {
  Transaction,
  FindOptions,
  WhereOptions,
  Includeable,
  OrderItem,
  Order,
  Attributes,
  ModelStatic,
} from 'sequelize'

// ── TS-union enums ─────────────────────────────────────────────────────────
// Both per-value VALUES arrays (used for DataType.ENUM(...VALUES)) and the
// human-friendly enum-shaped objects (e.g. `LeadStatus.ACTIVE`).
export {
  LeadType,
  LeadStatus,
  ActiveLeadStage,
  TmStage,
  InventoryStage,
  ExitStrategy,
  PropertyStatus,
  ContactType,
  MessageChannel,
  MessageDirection,
  TaskStatus,
  TaskType,
  CampaignType,
  CampaignStatus,
  AutomationTrigger,
  AutomationActionType,
  FileType,
  UserStatus,
  NotificationType,
  WebhookEventStatus,
  AiEngine,
  LeadCampaignType,
  LeadAssignmentMethod,
  WorkspaceType,
  TemplateType,
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
} from './enums'

// NOTE: migration runner exports (`migrateUp`, `migrateStatus`,
// `umzug`, `bootstrapFromPrismaHistory`) are deliberately NOT
// re-exported from this barrel. The `umzug` package transitively
// imports `@rushstack/ts-command-line` which depends on Node's
// `child_process` — pulling that into a client bundle (which
// happens whenever a client component imports a model from this
// barrel) breaks the build with `Module not found: child_process`.
// The migration CLI and its tests import directly from
// `./migrations-umzug/umzug` instead, and apps/api can do the
// same. If a future caller really needs the runner from the
// barrel, give it its own subpath export (e.g.
// `@crm/database/migrations`) so it doesn't poison the
// model-import path.
