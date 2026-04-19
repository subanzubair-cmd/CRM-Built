import { Worker, Queue } from 'bullmq'
import { redis } from '../lib/redis.js'
import { processDripCampaigns } from '../lib/drip-executor.js'
import { runAutomations, type AutomationJobData } from '../lib/automation-runner.js'
import { syncInboundEmails } from '../lib/imap-worker.js'
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '../lib/google-calendar.js'
import { prisma } from '../lib/prisma.js'

const connection = redis

// ── Drip Campaign Worker ───────────────────────────────────────────────────────
//
// Scans all active enrollments every 15 minutes and fires any steps whose
// delay has elapsed. This is a "tick" pattern — the job itself doesn't carry
// enrollment state; it just processes whatever is due at that moment.

const dripQueue = new Queue('drip-campaign', { connection })

// Schedule the recurring drip-check job if not already scheduled
async function scheduleDripJob() {
  const existing = await dripQueue.getRepeatableJobs()
  const alreadyScheduled = existing.some((j) => j.name === 'drip-tick')
  if (!alreadyScheduled) {
    await dripQueue.add(
      'drip-tick',
      {},
      { repeat: { every: 15 * 60 * 1000 } }, // every 15 min
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
//
// Processes automation jobs pushed by the promote route and lead creation route.
// Each job carries: { trigger, propertyId, meta? }
//
// Also hosts a periodic "no-contact-tick" that fires NO_CONTACT_X_DAYS
// automations against properties whose lastActivityAt has fallen past the
// configured threshold (conditions.days on each Automation row).

const automationQueueLocal = new Queue('automation', { connection })

async function scheduleNoContactTick() {
  const existing = await automationQueueLocal.getRepeatableJobs()
  const alreadyScheduled = existing.some((j) => j.name === 'no-contact-tick')
  if (!alreadyScheduled) {
    await automationQueueLocal.add(
      'no-contact-tick',
      {},
      { repeat: { every: 6 * 60 * 60 * 1000 } }, // every 6 hours
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
  // Fetch all active NO_CONTACT_X_DAYS automations
  const rules = await prisma.automation.findMany({
    where: { trigger: 'NO_CONTACT_X_DAYS' as any, isActive: true },
    select: { id: true, conditions: true },
  })
  if (rules.length === 0) return

  for (const rule of rules) {
    const conditions = (rule.conditions ?? {}) as Record<string, unknown>
    const days = Number(conditions.days ?? conditions.noContactDays ?? 7)
    if (!Number.isFinite(days) || days <= 0) continue

    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const stale = await prisma.property.findMany({
      where: {
        leadStatus: 'ACTIVE',
        OR: [
          { lastActivityAt: { lt: threshold } },
          { lastActivityAt: null, createdAt: { lt: threshold } },
        ],
      },
      select: { id: true },
      take: 500, // cap per tick to avoid runaway enqueueing
    })

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
// (real CSV processing handled in Phase 20)
new Worker(
  'csv-import',
  async (job) => {
    console.log(`[csv-import] job ${job.id} — processor not yet implemented`)
  },
  { connection },
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
      { repeat: { every: 5 * 60 * 1000 } }, // every 5 min
    )
    console.log('✓ task-reminder-tick repeat job scheduled (every 5 min)')
  }
}

new Worker(
  'notification',
  async (job) => {
    if (job.name === 'task-reminder-tick') {
      // 1. Notify about tasks due within next 30 minutes
      const now = new Date()
      const in30Min = new Date(now.getTime() + 30 * 60000)

      const upcomingTasks = await prisma.task.findMany({
        where: {
          status: 'PENDING',
          dueAt: { gte: now, lte: in30Min },
        },
        include: { assignedTo: true, property: true },
      })

      for (const task of upcomingTasks) {
        if (!task.assignedToId) continue
        // Avoid duplicate notifications: check if one already exists for this task in the last 30 min
        const existing = await prisma.notification.findFirst({
          where: {
            userId: task.assignedToId,
            type: 'TASK_DUE',
            propertyId: task.propertyId,
            createdAt: { gte: new Date(now.getTime() - 30 * 60000) },
            title: 'Task due soon',
          },
        })
        if (existing) continue
        await prisma.notification.create({
          data: {
            userId: task.assignedToId,
            type: 'TASK_DUE',
            title: 'Task due soon',
            body: `${task.title} — due ${task.dueAt?.toLocaleTimeString()}`,
            propertyId: task.propertyId,
          },
        })
      }

      // 2. Notify about overdue tasks
      const overdueTasks = await prisma.task.findMany({
        where: { status: 'PENDING', dueAt: { lt: now } },
        include: { assignedTo: true },
      })

      for (const task of overdueTasks) {
        if (!task.assignedToId) continue
        const existing = await prisma.notification.findFirst({
          where: {
            userId: task.assignedToId,
            type: 'TASK_DUE',
            propertyId: task.propertyId,
            createdAt: { gte: new Date(now.getTime() - 60 * 60000) },
            title: 'Task overdue',
          },
        })
        if (existing) continue
        await prisma.notification.create({
          data: {
            userId: task.assignedToId,
            type: 'TASK_DUE',
            title: 'Task overdue',
            body: `${task.title} was due ${task.dueAt?.toLocaleString()}`,
            propertyId: task.propertyId,
          },
        })
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
    await imapQueue.add('imap-tick', {}, { repeat: { every: 5 * 60 * 1000 } }) // every 5 min
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
//
// Fires after create/update/delete of an Appointment record.
// Job data: { action: 'create'|'update'|'delete', appointmentId, googleEventId? }

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

    // For create/update we need the full appointment record
    const apt = await prisma.appointment.findUnique({ where: { id: appointmentId } })
    if (!apt) {
      console.warn(`[calendar-sync] appointment ${appointmentId} not found`)
      return
    }

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
        await prisma.appointment.update({
          where: { id: appointmentId },
          data: { googleEventId: eventId },
        }).catch(() => {})
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
