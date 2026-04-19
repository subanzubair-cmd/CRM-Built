/**
 * Thin BullMQ queue client for the Next.js app.
 *
 * Shares the same Redis connection and queue names as apps/api.
 * Used to enqueue automation jobs after stage changes without
 * depending on an HTTP round-trip to the Express API.
 */

import { Queue } from 'bullmq'
import Redis from 'ioredis'

// Singleton Redis connection for the web app (lazy-initialised)
let _redis: Redis | null = null

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: true,
    })
    _redis.on('error', (err) => {
      // Non-fatal — queue push is best-effort
      console.warn('[queue] Redis error (non-fatal):', err.message)
    })
  }
  return _redis
}

// ── automationQueue ────────────────────────────────────────────────────────────

let _automationQueue: Queue | null = null

export function getAutomationQueue(): Queue {
  if (!_automationQueue) {
    _automationQueue = new Queue('automation', { connection: getRedis() })
  }
  return _automationQueue
}

export async function enqueueAutomation(data: {
  trigger: string
  propertyId: string
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    await getAutomationQueue().add('automation', data)
  } catch (err) {
    // Best-effort — never throw from an automation enqueue
    console.warn('[queue] enqueueAutomation failed (non-fatal):', err)
  }
}

// ── calendarSyncQueue ──────────────────────────────────────────────────────────

let _calendarQueue: Queue | null = null

export function getCalendarQueue(): Queue {
  if (!_calendarQueue) {
    _calendarQueue = new Queue('calendar-sync', { connection: getRedis() })
  }
  return _calendarQueue
}

export type CalendarSyncAction = 'create' | 'update' | 'delete'

export async function enqueueCalendarSync(data: {
  action: CalendarSyncAction
  appointmentId: string
  googleEventId?: string   // required for delete (record may already be gone)
}): Promise<void> {
  try {
    await getCalendarQueue().add('calendar-sync', data)
  } catch (err) {
    console.warn('[queue] enqueueCalendarSync failed (non-fatal):', err)
  }
}
