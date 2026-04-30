import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ImportJob } from '@crm/database'
import { minioClient } from '@/lib/minio'
import { Buffer } from 'node:buffer'
import { Queue } from 'bullmq'
import Redis from 'ioredis'

/**
 * POST /api/buyers/import
 *   multipart upload of a CSV file → MinIO + ImportJob row +
 *   enqueue csv-import worker. The expected CSV header is
 *
 *     firstName,lastName,email,phone,mailingAddress
 *
 *   Extra columns are ignored. Missing optional columns are fine.
 *
 * GET /api/buyers/import
 *   list recent jobs for the Import Log tab. We do NOT paginate yet —
 *   most customers have <100 imports, so a flat list is fine. Add
 *   pagination when this grows.
 */

const BUCKET = 'crm-files'

export async function GET() {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await ImportJob.findAll({
    where: { module: 'BUYERS' as any },
    order: [['createdAt', 'DESC']],
    limit: 100,
  })
  return NextResponse.json({ data: rows.map((r) => r.get({ plain: true })) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 422 })
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'CSV must be smaller than 25 MB.' },
      { status: 413 },
    )
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const storageKey = `imports/buyers/${Date.now()}-${file.name}`

  // Stash the raw CSV in MinIO so the worker can stream it back. The
  // route stays light — actual parsing happens off the request hot
  // path.
  await minioClient.putObject(BUCKET, storageKey, buffer, buffer.length, {
    'content-type': file.type || 'text/csv',
  })

  const job = await ImportJob.create({
    module: 'BUYERS' as any,
    createdById: userId || null,
    fileName: file.name,
    fileSize: buffer.length,
    fileStorageKey: storageKey,
    status: 'QUEUED' as any,
  } as any)

  // Enqueue. Web app keeps its own BullMQ Queue handle (per
  // apps/web/src/lib/queue.ts) but csv-import lives elsewhere — we
  // create a tiny one-off queue connection here rather than threading
  // the singleton.
  try {
    const connection = new Redis(
      process.env.REDIS_URL ?? 'redis://localhost:6379',
      { maxRetriesPerRequest: null, enableOfflineQueue: false, lazyConnect: true },
    )
    const queue = new Queue('csv-import', { connection })
    await queue.add('process', { jobId: job.id })
  } catch (err) {
    console.warn('[buyers/import] enqueue failed (job stays QUEUED):', err)
  }

  return NextResponse.json({ success: true, data: job }, { status: 201 })
}
