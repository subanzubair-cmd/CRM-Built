import { z } from 'zod'
import {
  CAMPAIGN_STEP_ACTION_TYPE_VALUES,
  CAMPAIGN_DELAY_UNIT_VALUES,
  CAMPAIGN_CONTACT_SCOPE_VALUES,
  PENDING_TASK_HANDLING_VALUES,
} from '@crm/database'

/**
 * Zod source-of-truth for the per-actionType `config` JSONB on
 * CampaignStep. The DB column itself is opaque JSON; this validator
 * is what gates writes at the API boundary.
 *
 * Each action's config has an `actionType` discriminant so
 * `discriminatedUnion` can pick the right shape without ambiguity.
 * Keep these in sync with the `CampaignStepConfig` TS union exported
 * from the model.
 */

const ContactScope = z.enum(CAMPAIGN_CONTACT_SCOPE_VALUES as [string, ...string[]])
const DelayUnit = z.enum(CAMPAIGN_DELAY_UNIT_VALUES as [string, ...string[]])
const PendingTaskHandling = z.enum(
  PENDING_TASK_HANDLING_VALUES as [string, ...string[]],
)

export const SmsConfigSchema = z.object({
  actionType: z.literal('SMS'),
  templateId: z.string().nullable().optional(),
  body: z.string().min(1).max(2000),
  recipientScope: ContactScope.default('PRIMARY'),
})

export const EmailConfigSchema = z.object({
  actionType: z.literal('EMAIL'),
  templateId: z.string().nullable().optional(),
  fromName: z.string().min(1).max(120),
  fromEmail: z.string().email(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  attachments: z
    .array(z.object({ name: z.string(), url: z.string().url() }))
    .default([]),
})

export const TaskConfigSchema = z.object({
  actionType: z.literal('TASK'),
  assigneeRoleId: z.string().nullable().optional(),
  assigneeUserId: z.string().nullable().optional(),
  priority: z
    .enum(['NONE', 'LOW', 'NORMAL', 'HIGH', 'URGENT'])
    .default('NONE'),
  title: z.string().min(1).max(200),
  detail: z.string().default(''),
  reminders: z
    .array(
      z.object({
        via: z.enum(['SMS', 'EMAIL']),
        amount: z.number().int().min(0),
        unit: DelayUnit,
      }),
    )
    .default([]),
})

export const WebhookConfigSchema = z.object({
  actionType: z.literal('WEBHOOK'),
  url: z.string().url(),
})

export const TagChangeConfigSchema = z.object({
  actionType: z.literal('TAG_CHANGE'),
  addTags: z.array(z.string().min(1)).default([]),
  removeTags: z.array(z.string().min(1)).default([]),
})

export const StatusChangeConfigSchema = z.object({
  actionType: z.literal('STATUS_CHANGE'),
  /** Status code valid for the campaign's module. The route does not
   *  validate against the module's status enum here — it's left to the
   *  UI + executor to keep concerns separated and let new statuses
   *  appear without a schema bump. */
  targetStatus: z.string().min(1),
  pendingTaskHandling: PendingTaskHandling,
})

export const DripEnrollConfigSchema = z.object({
  actionType: z.literal('DRIP_ENROLL'),
  targetCampaignId: z.string().min(1),
})

export const CampaignStepConfigSchema = z.discriminatedUnion('actionType', [
  SmsConfigSchema,
  EmailConfigSchema,
  TaskConfigSchema,
  WebhookConfigSchema,
  TagChangeConfigSchema,
  StatusChangeConfigSchema,
  DripEnrollConfigSchema,
])

export type CampaignStepConfigValidated = z.infer<typeof CampaignStepConfigSchema>

/**
 * Step-level fields (delay, isActive, skipWeekendsAndHolidays). The
 * `actionType` lives both at the step level and inside `config` for
 * the discriminator — they must match (we enforce this in the route).
 */
export const StepFieldsSchema = z.object({
  actionType: z.enum(
    CAMPAIGN_STEP_ACTION_TYPE_VALUES as [string, ...string[]],
  ),
  delayAmount: z.number().int().min(0).default(0),
  delayUnit: DelayUnit.default('MINUTES'),
  skipWeekendsAndHolidays: z.boolean().default(false),
  isActive: z.boolean().default(true),
  config: CampaignStepConfigSchema,
})

/** Patch shape — every step-level field optional, plus optional config. */
export const StepFieldsPatchSchema = z.object({
  actionType: z
    .enum(CAMPAIGN_STEP_ACTION_TYPE_VALUES as [string, ...string[]])
    .optional(),
  delayAmount: z.number().int().min(0).optional(),
  delayUnit: DelayUnit.optional(),
  skipWeekendsAndHolidays: z.boolean().optional(),
  isActive: z.boolean().optional(),
  config: CampaignStepConfigSchema.optional(),
})

/**
 * Cross-validation: when both `actionType` and `config` are present,
 * the discriminator inside the config must match the step's
 * actionType. This catches client bugs where the dropdown changed
 * but the embedded payload wasn't reset. Also enforces that a
 * TAG_CHANGE config has at least one tag to add or remove —
 * `discriminatedUnion` can't carry a `.refine` so we check it here.
 */
export function assertActionTypesMatch(
  actionType: string | undefined,
  config: { actionType: string } | undefined,
) {
  if (actionType && config && actionType !== config.actionType) {
    throw new Error(
      `actionType mismatch: step is "${actionType}" but config.actionType is "${config.actionType}"`,
    )
  }
  if (
    config &&
    config.actionType === 'TAG_CHANGE' &&
    ((config as any).addTags?.length ?? 0) +
      ((config as any).removeTags?.length ?? 0) ===
      0
  ) {
    throw new Error('Provide at least one tag to add or remove')
  }
}
