import { NextRequest, NextResponse } from 'next/server'
import { PassThrough } from 'stream'
import { pipeline } from 'stream/promises'
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

/**
 * Finalize the recording by streaming each chunk object out of MinIO
 * and into a single destination object — without ever holding the
 * full recording in memory.
 *
 * A 4-hour call at 5-second chunks is ~2,880 chunks * ~30 KB ≈ 86 MB.
 * The previous Buffer.concat approach loaded all of that into the Node
 * heap on every finalize; under concurrent finalizes this OOMs the
 * server. Streaming through a PassThrough lets MinIO's putObject use
 * its internal multipart upload, so memory stays flat regardless of
 * call length.
 */
async function finalizeRecording(callId: string, total: number) {
  const activeCall = await ActiveCall.findByPk(callId)
  if (!activeCall) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  // Probe chunk 0 for content-type so the final object reports the
  // right MIME. Bail if the very first chunk is missing — that means
  // recording never actually started and there's nothing to assemble.
  let firstContentType = 'audio/webm'
  try {
    const stat = await minioClient.statObject(
      BUCKET,
      `recordings/${callId}/chunk-00000.bin`,
    )
    firstContentType = stat.metaData?.['content-type'] || firstContentType
  } catch {
    return NextResponse.json({ ok: false, error: 'no chunks found' }, { status: 404 })
  }

  const ext = firstContentType.includes('mp4') ? 'mp4' : 'webm'
  // Partition by the call's actual start month, NOT finalize-now,
  // so a call that crosses midnight on the last day of the month
  // doesn't get filed under the wrong month's prefix. Falls back to
  // current time only when the row has no startedAt (shouldn't
  // happen — column is NOT NULL — but defensive).
  const startedAt = (activeCall as any).startedAt as Date | null
  const endedAtRaw = (activeCall as any).endedAt as Date | null
  const partitionDate = startedAt ? new Date(startedAt) : new Date()
  const yyyymm = partitionDate.toISOString().slice(0, 7)
  const finalKey = `recordings/${yyyymm}/${callId}.${ext}`

  // Compute duration BEFORE the upload — we need to write it into
  // the WebM EBML header on the first chunk so the new-tab native
  // audio preview shows duration immediately (and renders the
  // 3-dot download menu without waiting for the file to be played
  // through). For calls where endedAt isn't set yet (webhook
  // didn't land), fall back to "now" so we still inject something
  // sensible.
  const endedAtForDuration = endedAtRaw ?? new Date()
  const recordingDuration =
    startedAt
      ? Math.max(
          1,
          Math.round(
            (new Date(endedAtForDuration).getTime() - new Date(startedAt).getTime()) / 1000,
          ),
        )
      : null

  // Upload reads from `through` while the loop below writes chunk
  // bytes into it. MinIO's putObject does multipart internally for
  // streams so memory stays bounded.
  const through = new PassThrough({ highWaterMark: 1 * 1024 * 1024 })
  const uploadPromise = minioClient.putObject(BUCKET, finalKey, through, undefined, {
    'Content-Type': firstContentType,
  })

  ;(async () => {
    let written = 0
    for (let i = 0; i < total; i++) {
      const chunkKey = `recordings/${callId}/chunk-${String(i).padStart(5, '0')}.bin`
      try {
        const stream = await minioClient.getObject(BUCKET, chunkKey)
        await pipeline(stream, through, { end: false })
        written++
      } catch (err) {
        // Single missing chunk doesn't kill the whole recording; the
        // surrounding chunks still produce a playable file.
        console.warn(`[recording-chunk] missing chunk ${i} for call ${callId}:`, err)
      }
    }
    through.end()
    return written
  })().catch((err) => {
    console.error('[recording-chunk] streaming concat failed:', err)
    through.destroy(err instanceof Error ? err : new Error(String(err)))
  })

  try {
    await uploadPromise
  } catch (err) {
    console.error('[recording-chunk] putObject failed:', err)
    return NextResponse.json({ ok: false, error: 'finalize failed' }, { status: 500 })
  }

  await activeCall.update({
    recordingStorageKey: finalKey,
    recordingDuration,
  } as any)

  // Clean up the per-chunk objects (best-effort, parallel).
  await Promise.all(
    Array.from({ length: total }, (_, i) =>
      minioClient
        .removeObject(BUCKET, `recordings/${callId}/chunk-${String(i).padStart(5, '0')}.bin`)
        .catch(() => {}),
    ),
  )

  return NextResponse.json({ ok: true, storageKey: finalKey, durationSec: recordingDuration })
}
