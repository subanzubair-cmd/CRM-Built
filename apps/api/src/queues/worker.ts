import { Worker, Queue } from 'bullmq'
import { redis } from '../lib/redis.js'
import { processDripCampaigns } from '../lib/drip-executor.js'
import { runAutomations, type AutomationJobData } from '../lib/automation-runner.js'
import { syncInboundEmails } from '../lib/imap-worker.js'
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '../lib/google-calendar.js'
import {
  Property,
  Task,
  Notification,
  Automation,
  Appointment,
  User,
  Op,
} from '@crm/database'

const connection = redis

// ── Drip Campaign Worker ───────────────────────────────────────────────────────

const dripQueue = new Queue('drip-campaign', { connection })

async function scheduleDripJob() {
  const existing = await dripQueue.getRepeatableJobs()
  const alreadyScheduled = existing.some((j) => j.name === 'drip-tick')
  if (!alreadyScheduled) {
    await dripQueue.add(
      'drip-tick',
      {},
      { repeat: { every: 15 * 60 * 1000 } },
    )
    console.log('✓ drip-tick repeat job scheduled (every 15 min)')
  }
}

new Worker(
  'drip-campaign',
  async (job) => {
    if (job.name === 'drip-tick') {
      await processDripCampaigns()
    } else {
      console.log(`[drip-campaign] unknown job name: ${job.name}`)
    }
  },
  { connection },
)

scheduleDripJob().catch((err) => console.error('[drip] schedule error:', err))

// ── Automation Worker ──────────────────────────────────────────────────────────

const automationQueueLocal = new Queue('automation', { connection })

async function scheduleNoContactTick() {
  const existing = await automationQueueLocal.getRepeatableJobs()
  const alreadyScheduled = existing.some((j) => j.name === 'no-contact-tick')
  if (!alreadyScheduled) {
    await automationQueueLocal.add(
      'no-contact-tick',
      {},
      { repeat: { every: 6 * 60 * 60 * 1000 } },
    )
    console.log('✓ no-contact-tick repeat job scheduled (every 6h)')
  }
}

new Worker(
  'automation',
  async (job) => {
    if (job.name === 'no-contact-tick') {
      await fireNoContactAutomations()
      return
    }
    const data = job.data as AutomationJobData
    await runAutomations(data)
  },
  { connection },
)

scheduleNoContactTick().catch((err) => console.error('[automation] schedule error:', err))

async function fireNoContactAutomations(): Promise<void> {
  const rules = await Automation.findAll({
    where: { trigger: 'NO_CONTACT_X_DAYS', isActive: true },
    attributes: ['id', 'conditions'],
    raw: true,
  }) as unknown as Array<{ id: string; conditions: Record<string, unknown> | null }>
  if (rules.length === 0) return

  for (const rule of rules) {
    const conditions = (rule.conditions ?? {}) as Record<string, unknown>
    const days = Number(conditions.days ?? conditions.noContactDays ?? 7)
    if (!Number.isFinite(days) || days <= 0) continue

    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const stale = await Property.findAll({
      where: {
        leadStatus: 'ACTIVE',
        [Op.or]: [
          { lastActivityAt: { [Op.lt]: threshold } },
          { lastActivityAt: null, createdAt: { [Op.lt]: threshold } },
        ],
      },
      attributes: ['id'],
      limit: 500,
      raw: true,
    }) as unknown as Array<{ id: string }>

    for (const p of stale) {
      await automationQueueLocal.add('automation', {
        trigger: 'NO_CONTACT_X_DAYS',
        propertyId: p.id,
        meta: { automationId: rule.id, days },
      })
    }

    console.log(`[automation] no-contact-tick: enqueued ${stale.length} properties for rule ${rule.id} (days=${days})`)
  }
}

// ── CSV Import Worker ──────────────────────────────────────────────────────────
new Worker(
  'csv-import',
  async (job) => {
    // CSV import processing lands in Phase H — for now log so the
    // queue health check stays clean.
    console.log(`[csv-import] job ${job.id} — processor not yet implemented`)
  },
  { connection },
)

// ── Bulk SMS Send Worker ───────────────────────────────────────────────────────
//
// One job per recipient. Per-row state transitions in the worker
// itself (sees BulkSmsBlastRecipient.status) — no scheduled tick.
import { processBulkSmsJob, type BulkSmsJobData } from '../lib/bulk-sms-executor.js'

new Worker(
  'bulk-sms-send',
  async (job) => {
    if (job.name === 'send-recipient') {
      await processBulkSmsJob(job.data as BulkSmsJobData)
      return
    }
    console.log(`[bulk-sms-send] unknown job name: ${job.name}`)
  },
  { connection, concurrency: 5 },
)

// ── Notification Worker ────────────────────────────────────────────────────────

const notificationQueue = new Queue('notification', { connection })

async function scheduleTaskReminderJob() {
  const existing = await notificationQueue.getRepeatableJobs()
  const alreadyScheduled = existing.some((j) => j.name === 'task-reminder-tick')
  if (!alreadyScheduled) {
    await notificationQueue.add(
      'task-reminder-tick',
      {},
      { repeat: { every: 5 * 60 * 1000 } },
    )
    console.log('✓ task-reminder-tick repeat job scheduled (every 5 min)')
  }
}

new Worker(
  'notification',
  async (job) => {
    if (job.name === 'task-reminder-tick') {
      const now = new Date()
      const in30Min = new Date(now.getTime() + 30 * 60000)

      const upcomingRows = await Task.findAll({
        where: {
          status: 'PENDING',
          dueAt: { [Op.gte]: now, [Op.lte]: in30Min },
        },
        include: [
          { model: User, as: 'assignedTo' },
          { model: Property, as: 'property' },
        ],
      })
      const upcomingTasks = upcomingRows.map((t) => t.get({ plain: true }) as any)

      for (const task of upcomingTasks) {
        if (!task.assignedToId) continue
        const existing = await Notification.findOne({
          where: {
            userId: task.assignedToId,
            type: 'TASK_DUE',
            propertyId: task.propertyId,
            createdAt: { [Op.gte]: new Date(now.getTime() - 30 * 60000) },
            title: 'Task due soon',
          },
          raw: true,
        })
        if (existing) continue
        await Notification.create({
          userId: task.assignedToId,
          type: 'TASK_DUE',
          title: 'Task due soon',
          body: `${task.title} — due ${task.dueAt ? new Date(task.dueAt).toLocaleTimeString() : ''}`,
          propertyId: task.propertyId,
        } as any)
      }

      const overdueRows = await Task.findAll({
        where: { status: 'PENDING', dueAt: { [Op.lt]: now } },
        include: [{ model: User, as: 'assignedTo' }],
      })
      const overdueTasks = overdueRows.map((t) => t.get({ plain: true }) as any)

      for (const task of overdueTasks) {
        if (!task.assignedToId) continue
        const existing = await Notification.findOne({
          where: {
            userId: task.assignedToId,
            type: 'TASK_DUE',
            propertyId: task.propertyId,
            createdAt: { [Op.gte]: new Date(now.getTime() - 60 * 60000) },
            title: 'Task overdue',
          },
          raw: true,
        })
        if (existing) continue
        await Notification.create({
          userId: task.assignedToId,
          type: 'TASK_DUE',
          title: 'Task overdue',
          body: `${task.title} was due ${task.dueAt ? new Date(task.dueAt).toLocaleString() : ''}`,
          propertyId: task.propertyId,
        } as any)
      }

      console.log(`[notification] task-reminder-tick: ${upcomingTasks.length} upcoming, ${overdueTasks.length} overdue`)
    } else {
      console.log(`[notification] job ${job.id} — processor not yet implemented`)
    }
  },
  { connection },
)

scheduleTaskReminderJob().catch((err) => console.error('[notification] schedule error:', err))

// ── IMAP email sync worker ─────────────────────────────────────────────────────
const imapQueue = new Queue('imap-sync', { connection })

async function scheduleImapJob() {
  const existing = await imapQueue.getRepeatableJobs()
  const alreadyScheduled = existing.some((j) => j.name === 'imap-tick')
  if (!alreadyScheduled) {
    await imapQueue.add('imap-tick', {}, { repeat: { every: 5 * 60 * 1000 } })
    console.log('✓ imap-tick repeat job scheduled (every 5 min)')
  }
}

new Worker(
  'imap-sync',
  async (job) => {
    if (job.name === 'imap-tick') {
      await syncInboundEmails()
    }
  },
  { connection },
)

scheduleImapJob().catch((err) => console.error('[imap] schedule error:', err))

// ── Google Calendar Sync Worker ────────────────────────────────────────────────

new Worker(
  'calendar-sync',
  async (job) => {
    const { action, appointmentId, googleEventId } = job.data as {
      action: 'create' | 'update' | 'delete'
      appointmentId: string
      googleEventId?: string
    }

    if (action === 'delete') {
      if (googleEventId) {
        await deleteCalendarEvent(googleEventId).catch((err) =>
          console.error('[calendar-sync] deleteCalendarEvent failed:', err),
        )
      }
      return
    }

    const aptRow = await Appointment.findByPk(appointmentId)
    if (!aptRow) {
      console.warn(`[calendar-sync] appointment ${appointmentId} not found`)
      return
    }
    const apt = aptRow.get({ plain: true }) as any

    if (action === 'create') {
      const eventId = await createCalendarEvent({
        title: apt.title,
        description: apt.description ?? undefined,
        location: apt.location ?? undefined,
        startAt: apt.startAt,
        endAt: apt.endAt,
        attendees: apt.attendees,
      }).catch((err) => {
        console.error('[calendar-sync] createCalendarEvent failed:', err)
        return null
      })

      if (eventId) {
        await Appointment.update(
          { googleEventId: eventId },
          { where: { id: appointmentId } },
        ).catch(() => {})
      }
    } else if (action === 'update') {
      if (apt.googleEventId) {
        await updateCalendarEvent(apt.googleEventId, {
          title: apt.title,
          description: apt.description ?? undefined,
          location: apt.location ?? undefined,
          startAt: apt.startAt,
          endAt: apt.endAt,
          attendees: apt.attendees,
        }).catch((err) => console.error('[calendar-sync] updateCalendarEvent failed:', err))
      }
    }
  },
  { connection },
)

console.log('✓ BullMQ workers started (drip + automation + notification + imap + calendar-sync wired)')
