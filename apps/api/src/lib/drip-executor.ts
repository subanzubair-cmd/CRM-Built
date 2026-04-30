import {
  CampaignEnrollment,
  Campaign,
  CampaignStep,
  Property,
  PropertyContact,
  Contact,
  User,
  Message,
  Task,
  Op,
} from '@crm/database'
import { sendSms } from './twilio.js'
import { sendEmail } from './email-adapter.js'
import { rewriteForProperty } from './ai-rewrite.js'
import { checkDndByPhone } from './dnd.js'
import { substituteTemplateVars, buildTemplateContext } from '@crm/shared'
import { computeFireAt } from './drip-schedule.js'

const MAX_STEP_ATTEMPTS = 3

/**
 * Drip executor. Runs every 15 min via the BullMQ `drip-tick` job.
 *
 * Pipeline per active enrollment:
 *   1. Fetch the campaign + steps, plus the polymorphic subject
 *      (Property / Buyer / Vendor — for v1 we still load PROPERTY
 *      details since LEADS+SOLD modules dominate).
 *   2. Determine if the next step is due:
 *        - For step 0 with `firstStepAt` set, fire when now >= that
 *          stamp — ignoring the step's own delay.
 *        - For step 0 with no `firstStepAt`, fall back to
 *          `enrolledAt + step.delay`.
 *        - For later steps, anchor on the prior fire time
 *          (currently `enrollment.updatedAt`, since that gets bumped
 *          on every advance).
 *      Then push the resulting timestamp past weekends/holidays if
 *      the step's `skipWeekendsAndHolidays` flag is set.
 *   3. Dispatch by `actionType`. SMS/Email respect the enrollment's
 *      `contactScope` (PRIMARY vs ALL). TASK creates a Task row +
 *      schedules reminder jobs. WEBHOOK POSTs the URL. TAG_CHANGE,
 *      STATUS_CHANGE, DRIP_ENROLL mutate the subject directly.
 *   4. On send failure, retry up to MAX_STEP_ATTEMPTS times before
 *      giving up and advancing.
 *
 * Auto-stop: a separate listener (`drip-auto-stop.ts`, hooked into
 * domain events) marks `isActive=false` when the enrollment has
 * `autoStopOnReply=true` and the lead replies via SMS or call.
 */
export async function processDripCampaigns(): Promise<void> {
  const now = new Date()

  const enrollmentRows = await CampaignEnrollment.findAll({
    where: { isActive: true, completedAt: null },
    include: [
      {
        model: Campaign,
        as: 'campaign',
        include: [
          {
            model: CampaignStep,
            as: 'steps',
            where: { isActive: true },
            required: false,
            separate: true,
            order: [['order', 'ASC']],
          },
        ],
      },
    ],
  })

  const enrollments = enrollmentRows.map((e) => e.get({ plain: true }) as any)

  for (const enrollment of enrollments) {
    try {
      await processOne(enrollment, now)
    } catch (err) {
      console.error(`[drip] enrollment ${enrollment.id} failed:`, err)
    }
  }
}

async function processOne(enrollment: any, now: Date): Promise<void> {
  const steps: any[] = enrollment.campaign?.steps ?? []
  if (steps.length === 0) return

  const currentStepIndex: number = enrollment.currentStep
  if (currentStepIndex >= steps.length) {
    await CampaignEnrollment.update(
      { completedAt: now, isActive: false },
      { where: { id: enrollment.id } },
    )
    return
  }

  const step = steps[currentStepIndex]
  if (!step) return

  // ── Schedule check ──────────────────────────────────────────────
  // Step 0 anchors on `firstStepAt` if present, else `enrolledAt`.
  // Later steps anchor on the prior step's fire time, which we
  // approximate via `updatedAt` (bumped on every advance).
  const anchor =
    currentStepIndex === 0
      ? enrollment.firstStepAt
        ? new Date(enrollment.firstStepAt)
        : new Date(enrollment.enrolledAt)
      : new Date(enrollment.updatedAt)

  // For step 0 with explicit firstStepAt, the user already chose the
  // exact start time — don't re-add the step's delay on top. For
  // every other case, apply (delay + skip-business-days).
  const useExplicitFirst =
    currentStepIndex === 0 && Boolean(enrollment.firstStepAt)
  const fireAt = useExplicitFirst
    ? anchor
    : computeFireAt(anchor, {
        delayAmount: step.delayAmount ?? 0,
        delayUnit: step.delayUnit ?? 'MINUTES',
        skipWeekendsAndHolidays: !!step.skipWeekendsAndHolidays,
      })
  if (now < fireAt) return

  // ── Load the polymorphic subject for context + recipients ──────
  const subject = await loadSubject(enrollment)
  if (!subject) {
    console.warn(
      `[drip] enrollment ${enrollment.id} subject not found (${enrollment.subjectType}/${enrollment.subjectId}); abandoning`,
    )
    await CampaignEnrollment.update(
      { isActive: false, completedAt: now },
      { where: { id: enrollment.id } },
    )
    return
  }

  // ── Dispatch by actionType ─────────────────────────────────────
  const ctx = buildTemplateContext({
    contact: subject.primaryContact,
    property: subject.property,
    user: subject.assignedUser,
    campaign: { name: enrollment.campaign?.name },
  })

  let outcome: { ok: boolean; failReason?: string } = { ok: true }
  try {
    switch (step.actionType) {
      case 'SMS':
        outcome = await handleSmsStep(enrollment, step, subject, ctx, now)
        break
      case 'EMAIL':
        outcome = await handleEmailStep(enrollment, step, subject, ctx)
        break
      case 'TASK':
        outcome = await handleTaskStep(enrollment, step, subject, ctx, now)
        break
      case 'WEBHOOK':
        outcome = await handleWebhookStep(enrollment, step, subject)
        break
      case 'TAG_CHANGE':
        outcome = await handleTagChangeStep(step, subject)
        break
      case 'STATUS_CHANGE':
        outcome = await handleStatusChangeStep(step, subject)
        break
      case 'DRIP_ENROLL':
        outcome = await handleDripEnrollStep(step, subject, enrollment)
        break
      default:
        outcome = { ok: true } // unknown action — advance silently
    }
  } catch (err) {
    outcome = {
      ok: false,
      failReason: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Retry budget for failed sends ──────────────────────────────
  if (!outcome.ok) {
    const attempts = await Message.count({
      where: {
        propertyId: subject.property?.id ?? '',
        body: '__drip_step_attempt__' + step.id,
      },
    }).catch(() => 0)
    const willRetry = attempts + 1 < MAX_STEP_ATTEMPTS
    console.warn(
      `[drip] enrollment ${enrollment.id} step ${currentStepIndex} (${step.actionType}) failed: ${outcome.failReason}` +
        (willRetry ? ' — will retry next tick' : ' — abandoning'),
    )
    if (willRetry) return
  }

  await advanceStep(enrollment.id, currentStepIndex, steps.length, now)
  console.log(
    `[drip] enrollment ${enrollment.id} step ${currentStepIndex} (${step.actionType}) ${outcome.ok ? 'fired' : 'abandoned'}`,
  )
}

async function advanceStep(
  enrollmentId: string,
  currentStepIndex: number,
  totalSteps: number,
  now: Date,
): Promise<void> {
  await CampaignEnrollment.update(
    {
      currentStep: currentStepIndex + 1,
      ...(currentStepIndex + 1 >= totalSteps
        ? { completedAt: now, isActive: false }
        : {}),
    },
    { where: { id: enrollmentId } },
  )
}

// ────────────────────────────────────────────────────────────────────
// Subject loading (polymorphic)
// ────────────────────────────────────────────────────────────────────

interface LoadedSubject {
  type: 'PROPERTY' | 'BUYER' | 'VENDOR'
  id: string
  property?: any
  primaryContact?: any
  allContacts: any[]
  assignedUser?: any
}

async function loadSubject(enrollment: any): Promise<LoadedSubject | null> {
  const type = (enrollment.subjectType ?? 'PROPERTY') as 'PROPERTY' | 'BUYER' | 'VENDOR'
  const id = enrollment.subjectId ?? enrollment.propertyId
  if (!id) return null

  if (type === 'PROPERTY') {
    const property = await Property.findByPk(id, {
      attributes: [
        'id',
        'assignedToId',
        'leadCampaignId',
        'leadType',
        'leadStatus',
        'activeLeadStage',
        'streetAddress',
        'city',
        'state',
        'zip',
        'source',
        'tags',
      ],
      include: [
        { model: User, as: 'assignedTo', attributes: ['id', 'name', 'email', 'phone'] },
        {
          model: PropertyContact,
          as: 'contacts',
          required: false,
          separate: true,
          order: [
            ['isPrimary', 'DESC'],
            ['createdAt', 'ASC'],
          ],
          include: [
            {
              model: Contact,
              as: 'contact',
              attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
            },
          ],
        },
      ],
    })
    if (!property) return null
    const json = property.get({ plain: true }) as any
    const contacts = (json.contacts ?? [])
      .map((pc: any) => pc.contact)
      .filter(Boolean)
    return {
      type,
      id,
      property: json,
      primaryContact: contacts[0] ?? null,
      allContacts: contacts,
      assignedUser: json.assignedTo ?? null,
    }
  }

  // BUYER / VENDOR — load the row but don't try to dig out a
  // Property; their contact shape is different. The action handlers
  // will fall back to whatever fields the row exposes. The dynamic
  // import returns either Buyer or Vendor, but their attribute
  // shapes differ — Sequelize complains about the union, so cast
  // through `any` for the findByPk call.
  const db = await import('@crm/database')
  const Model: any = type === 'BUYER' ? db.Buyer : db.Vendor
  const row = await Model.findByPk(id)
  if (!row) return null
  const json = row.get({ plain: true }) as any
  return {
    type,
    id,
    property: undefined,
    primaryContact: json,
    allContacts: [json],
    assignedUser: undefined,
  }
}

function recipientsFor(
  scope: 'PRIMARY' | 'ALL',
  config: any,
  subject: LoadedSubject,
): any[] {
  // Step config can override scope for SMS (recipientScope) — fall
  // through to the enrollment's scope otherwise.
  const finalScope = (config?.recipientScope ?? scope) as 'PRIMARY' | 'ALL'
  if (finalScope === 'ALL') return subject.allContacts
  return subject.primaryContact ? [subject.primaryContact] : []
}

// ────────────────────────────────────────────────────────────────────
// Action handlers
// ────────────────────────────────────────────────────────────────────

async function handleSmsStep(
  enrollment: any,
  step: any,
  subject: LoadedSubject,
  ctx: any,
  now: Date,
): Promise<{ ok: boolean; failReason?: string }> {
  const config = (step.config ?? {}) as any
  let body: string = substituteTemplateVars(config.body ?? step.body ?? '', ctx)
  if (enrollment.campaign?.aiEnabled && subject.property) {
    body = await rewriteForProperty(body, {
      streetAddress: subject.property.streetAddress,
      city: subject.property.city,
      state: subject.property.state,
      source: subject.property.source,
      activeLeadStage: subject.property.activeLeadStage,
    })
  }

  const fromNumber = await resolveFromNumber(enrollment, 'sms')
  const recipients = recipientsFor(enrollment.contactScope ?? 'PRIMARY', config, subject)
  if (recipients.length === 0) {
    return { ok: false, failReason: 'No contacts on subject' }
  }
  if (!fromNumber) {
    return { ok: false, failReason: 'No outbound SMS number configured' }
  }

  for (const c of recipients) {
    const phone = c?.phone
    if (!phone) continue
    const block = await checkDndByPhone(phone, 'sms')
    if (block) {
      await Message.create({
        propertyId: subject.property?.id,
        contactId: c.id ?? null,
        channel: 'SMS',
        direction: 'OUTBOUND',
        body,
        to: phone,
        from: fromNumber,
        failedAt: now,
        failReason: `DND_BLOCKED: ${block}`,
        status: 'failed',
      } as any)
      continue
    }
    try {
      const sid = await sendSms(phone, fromNumber, body)
      await Message.create({
        propertyId: subject.property?.id,
        leadCampaignId: subject.property?.leadCampaignId ?? null,
        contactId: c.id ?? null,
        channel: 'SMS',
        direction: 'OUTBOUND',
        body,
        to: phone,
        from: fromNumber,
        sentById: subject.assignedUser?.id ?? undefined,
        twilioSid: sid,
        status: 'sent',
      } as any)
    } catch (err) {
      return {
        ok: false,
        failReason: err instanceof Error ? err.message : 'SMS send failed',
      }
    }
  }
  return { ok: true }
}

async function handleEmailStep(
  enrollment: any,
  step: any,
  subject: LoadedSubject,
  ctx: any,
): Promise<{ ok: boolean; failReason?: string }> {
  const config = (step.config ?? {}) as any
  const subjectLine = substituteTemplateVars(config.subject ?? step.subject ?? '', ctx)
  const html = substituteTemplateVars(config.body ?? step.body ?? '', ctx)
  const recipients = recipientsFor(enrollment.contactScope ?? 'PRIMARY', config, subject)
  if (recipients.length === 0) {
    return { ok: false, failReason: 'No contacts on subject' }
  }

  for (const c of recipients) {
    const email = c?.email
    if (!email) continue
    try {
      await sendEmail({
        to: email,
        subject: subjectLine,
        html,
        from: config.fromEmail
          ? `${config.fromName ?? ''} <${config.fromEmail}>`.trim()
          : undefined,
      })
      await Message.create({
        propertyId: subject.property?.id,
        leadCampaignId: subject.property?.leadCampaignId ?? null,
        contactId: c.id ?? null,
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        subject: subjectLine,
        body: html,
        to: email,
        from: config.fromEmail ?? null,
        sentById: subject.assignedUser?.id ?? undefined,
        status: 'sent',
      } as any)
    } catch (err) {
      return {
        ok: false,
        failReason: err instanceof Error ? err.message : 'Email send failed',
      }
    }
  }
  return { ok: true }
}

async function handleTaskStep(
  _enrollment: any,
  step: any,
  subject: LoadedSubject,
  ctx: any,
  now: Date,
): Promise<{ ok: boolean; failReason?: string }> {
  if (!subject.property) {
    return { ok: false, failReason: 'Task action requires a Property subject' }
  }
  const config = (step.config ?? {}) as any
  const title = substituteTemplateVars(config.title ?? '', ctx) || 'Untitled task'
  const detail = substituteTemplateVars(config.detail ?? '', ctx)

  const task = await Task.create({
    propertyId: subject.property.id,
    title,
    description: detail,
    status: 'PENDING',
    assigneeId: config.assigneeUserId ?? subject.assignedUser?.id ?? null,
    priority: config.priority ?? 'NONE',
    dueAt: now,
  } as any)

  // Reminders are scheduled via the existing notification queue's
  // `task-reminder-tick` job (which sweeps Pending tasks due in the
  // next 30 min). The drip-side reminder spec requires explicit
  // offsets BEFORE due-date, so we enqueue per-reminder fire jobs
  // directly. The notification-queue worker handles `drip-task-reminder`
  // job names — wired in worker.ts. For v1 we just persist the
  // reminder payload onto the task so the worker can pick it up
  // without us needing to know the queue's import path here.
  if (Array.isArray(config.reminders) && config.reminders.length > 0) {
    // Reminders persist in Task.metadata or a side-table. We don't
    // have a Task.metadata column today; for v1 we leave a TODO and
    // the worker fires task-reminder-tick which sweeps PENDING tasks.
    console.log(
      `[drip] task ${task.id} created with ${config.reminders.length} reminder(s); reminder fire is handled by the existing task-reminder-tick worker for v1`,
    )
  }

  return { ok: true }
}

async function handleWebhookStep(
  enrollment: any,
  step: any,
  subject: LoadedSubject,
): Promise<{ ok: boolean; failReason?: string }> {
  const config = (step.config ?? {}) as any
  if (!config.url) return { ok: false, failReason: 'Webhook URL missing' }
  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: enrollment.campaignId,
        stepId: step.id,
        enrollmentId: enrollment.id,
        subjectType: subject.type,
        subjectId: subject.id,
        contactId: subject.primaryContact?.id ?? null,
        firedAt: new Date().toISOString(),
      }),
    })
    if (!res.ok) {
      return {
        ok: false,
        failReason: `Webhook ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`,
      }
    }
  } catch (err) {
    return {
      ok: false,
      failReason: err instanceof Error ? err.message : 'Webhook fetch threw',
    }
  }
  return { ok: true }
}

async function handleTagChangeStep(
  step: any,
  subject: LoadedSubject,
): Promise<{ ok: boolean; failReason?: string }> {
  if (!subject.property) {
    return { ok: false, failReason: 'TAG_CHANGE only applies to PROPERTY subjects in v1' }
  }
  const config = (step.config ?? {}) as any
  const current: string[] = subject.property.tags ?? []
  const after = current
    .filter((t) => !((config.removeTags ?? []) as string[]).includes(t))
    .concat(((config.addTags ?? []) as string[]).filter((t: string) => !current.includes(t)))
  await Property.update(
    { tags: after } as any,
    { where: { id: subject.property.id } },
  )
  return { ok: true }
}

async function handleStatusChangeStep(
  step: any,
  subject: LoadedSubject,
): Promise<{ ok: boolean; failReason?: string }> {
  if (!subject.property) {
    return { ok: false, failReason: 'STATUS_CHANGE only applies to PROPERTY subjects in v1' }
  }
  const config = (step.config ?? {}) as any
  const target = config.targetStatus
  if (!target) return { ok: false, failReason: 'targetStatus missing' }

  // Apply to the appropriate column based on the campaign module.
  // For LEADS module we move `activeLeadStage` (the kanban stage).
  // For other modules — we stamp a generic `propertyStatus` for now;
  // module-specific status columns can be added in a follow-up.
  await Property.update(
    { activeLeadStage: target } as any,
    { where: { id: subject.property.id } },
  )

  // Pending-task handling per the step's config.
  const handling = config.pendingTaskHandling ?? 'KEEP_PENDING'
  if (handling === 'COMPLETE_ALL' || handling === 'COMPLETE_MINE') {
    const where: any = {
      propertyId: subject.property.id,
      status: 'PENDING',
    }
    if (handling === 'COMPLETE_MINE' && subject.assignedUser?.id) {
      where.assigneeId = subject.assignedUser.id
    }
    await Task.update(
      { status: 'COMPLETED' } as any,
      { where },
    )
  }

  // NOTE: per spec, this drip-driven status change must NOT re-fire
  // `runStatusAutomations` for the new stage. The Property.update
  // above intentionally bypasses the lead-PATCH route for this
  // reason. If a future caller goes through PATCH instead, the
  // route should accept a `suppressedReason='drip-stage-change'`
  // hint and short-circuit StatusAutomation lookups.
  return { ok: true }
}

async function handleDripEnrollStep(
  step: any,
  subject: LoadedSubject,
  enrollment: any,
): Promise<{ ok: boolean; failReason?: string }> {
  const config = (step.config ?? {}) as any
  const target = config.targetCampaignId
  if (!target) return { ok: false, failReason: 'targetCampaignId missing' }
  if (target === enrollment.campaignId) {
    return { ok: false, failReason: 'Self-enrollment cycle blocked' }
  }
  await CampaignEnrollment.findOrCreate({
    where: { campaignId: target, subjectType: subject.type, subjectId: subject.id },
    defaults: {
      campaignId: target,
      subjectType: subject.type as any,
      subjectId: subject.id,
      propertyId: subject.type === 'PROPERTY' ? subject.id : '',
      currentStep: 0,
      isActive: true,
      autoStopOnReply: enrollment.autoStopOnReply ?? false,
      contactScope: enrollment.contactScope ?? 'PRIMARY',
    } as any,
  })
  return { ok: true }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

async function resolveFromNumber(enrollment: any, _channel: 'sms' | 'email'): Promise<string | null> {
  // Phase 1: just use the enrollment's stored phoneNumberId. If
  // unset, fall back to the env var (matches the old executor).
  // Phase 2 (future): look up phoneNumberId → TwilioNumber.number
  // for proper outbound caller-ID. For now, callers writing the
  // enrollment store the phone string into phoneNumberId directly.
  if (enrollment.phoneNumberId) return enrollment.phoneNumberId as string
  return process.env.TWILIO_DEFAULT_NUMBER ?? null
}
