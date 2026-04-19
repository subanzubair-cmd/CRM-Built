import { Queue } from 'bullmq'
import { redis } from '../lib/redis.js'

const connection = redis

export const dripCampaignQueue = new Queue('drip-campaign', { connection })
export const automationQueue = new Queue('automation', { connection })
export const csvImportQueue = new Queue('csv-import', { connection })
export const notificationQueue = new Queue('notification', { connection })

console.log('✓ BullMQ queues initialized')
