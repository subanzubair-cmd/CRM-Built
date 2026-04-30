import { Queue } from 'bullmq'
import { redis } from '../lib/redis.js'

const connection = redis

export const dripCampaignQueue = new Queue('drip-campaign', { connection })
export const automationQueue = new Queue('automation', { connection })
export const csvImportQueue = new Queue('csv-import', { connection })
export const notificationQueue = new Queue('notification', { connection })

/**
 * `bulkSmsSendQueue` — fans out a buyers SMS broadcast across N
 * recipient jobs. One job per recipient lets the per-row state
 * transitions happen atomically and gives us natural retry granularity
 * (a single failed recipient retries without re-sending the whole
 * blast). The web app's POST /api/buyers/bulk-sms enqueues into here.
 */
export const bulkSmsSendQueue = new Queue('bulk-sms-send', { connection })

console.log('✓ BullMQ queues initialized')
