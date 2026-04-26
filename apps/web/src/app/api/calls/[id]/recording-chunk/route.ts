import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ActiveCall } from '@crm/database'
import { minioClient, BUCKET, ensureBucket } from '@/lib/minio'

/**
 * POST /api/calls/[id]/recording-chunk?seq=N
 *   - Receives one MediaRecorder chunk (audio/webm or audio/mp4).
 *   - Uploads as `recordings/<callId>/chunk-<seq>.bin` in MinIO.
 *
 * POST /api/calls/[id]/recording-chunk?finalize=true&total=N
 *   - All chunks uploaded — concatenate them server-side into
 *     `recordings/<yyyy-mm>/<callId>.<ext>`, persist the storage key
 *     on ActiveCall.recordingStorageKey, and clean up the chunk objects.
 *
 * The streaming endpoint /api/calls/[id]/recording then signs a short
 * MinIO URL from recordingStorageKey for the audio player.
 *
 * Beacon-safe: works with navigator.sendBeacon for unload-time finalize.
 */
type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  // Webhook-style routes can be hit by sendBeacon during page unload;
  // session cookie is included automatically.
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const url = new URL(req.url)
  const finalize = url.searchParams.get('finalize') === 'true'
  const seqStr = url.searchParams.get('seq')
  const totalStr = url.searchParams.get('total')

  await ensureBucket()

  if (finalize) {
    const total = totalStr ? parseInt(totalStr, 10) : 0
    if (!Number.isFinite(total) || total < 1) {
      return NextResponse.json({ ok: true, ignored: 'no chunks to finalize' })
    }
    return finalizeRecording(id, total)
  }

  if (seqStr === null) {
    return NextResponse.json({ error: 'seq query param required' }, { status: 400 })
  }
  const seq = parseInt(seqStr, 10)
  if (!Number.isFinite(seq) || seq < 0) {
    return NextResponse.json({ error: 'seq must be a non-negative integer' }, { status: 400 })
  }

  const buf = Buffer.from(await req.arrayBuffer())
  if (buf.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'empty chunk' })
  }
  const contentType = req.headers.get('content-type') || 'application/octet-stream'

  const chunkKey = `recordings/${id}/chunk-${String(seq).padStart(5, '0')}.bin`
  await minioClient.putObject(BUCKET, chunkKey, buf, buf.length, { 'Content-Type': contentType })

  return NextResponse.json({ ok: true, seq, size: buf.length })
}

async function finalizeRecording(callId: string, total: number) {
  const activeCall = await ActiveCall.findByPk(callId)
  if (!activeCall) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  // Concatenate the chunks. MediaRecorder emits an init segment in chunk 0
  // and continuation segments after; concatenating raw bytes yields a
  // playable WebM/MP4 in practice. Long-term we'd remux server-side, but
  // this works for typical sales calls (<30 min).
  const chunks: Buffer[] = []
  let firstContentType = 'audio/webm'
  let totalSize = 0
  for (let i = 0; i < total; i++) {
    const chunkKey = `recordings/${callId}/chunk-${String(i).padStart(5, '0')}.bin`
    try {
      const stream = await minioClient.getObject(BUCKET, chunkKey)
      const stat = await minioClient.statObject(BUCKET, chunkKey)
      if (i === 0) firstContentType = stat.metaData?.['content-type'] || firstContentType
      const buf = await streamToBuffer(stream)
      chunks.push(buf)
      totalSize += buf.length
    } catch (err) {
      console.warn(`[recording-chunk] missing chunk ${i} for call ${callId}:`, err)
    }
  }

  if (chunks.length === 0) {
    return NextResponse.json({ ok: false, error: 'no chunks found' }, { status: 404 })
  }

  const merged = Buffer.concat(chunks, totalSize)
  const ext = firstContentType.includes('mp4') ? 'mp4' : 'webm'
  const yyyymm = new Date().toISOString().slice(0, 7)
  const finalKey = `recordings/${yyyymm}/${callId}.${ext}`
  await minioClient.putObject(BUCKET, finalKey, merged, merged.length, {
    'Content-Type': firstContentType,
  })

  await activeCall.update({
    recordingStorageKey: finalKey,
    recordingDuration: null, // populated by browser metadata or post-processing later
  } as any)

  // Clean up the per-chunk objects (best-effort).
  await Promise.all(
    Array.from({ length: total }, (_, i) =>
      minioClient
        .removeObject(BUCKET, `recordings/${callId}/chunk-${String(i).padStart(5, '0')}.bin`)
        .catch(() => {}),
    ),
  )

  return NextResponse.json({ ok: true, storageKey: finalKey, size: merged.length })
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}
