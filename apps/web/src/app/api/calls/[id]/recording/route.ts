import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ActiveCall } from '@crm/database'
import { getPresignedUrl } from '@/lib/minio'

/**
 * GET /api/calls/[id]/recording
 *
 * Returns a short-lived presigned MinIO URL plus a `durationSec` the
 * audio player uses to render the scrubber. Duration is derived in
 * priority order:
 *   1) ActiveCall.recordingDuration (set by future post-processing)
 *   2) (endedAt - startedAt) — accurate for the live MediaRecorder
 *      pipeline, where the recording covers the full call lifetime
 *
 * The 2nd path matters because MediaRecorder's WebM output frequently
 * has duration=Infinity in browser metadata (no Cues element written),
 * so the scrubber would otherwise be unusable.
 */
type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const call = (await ActiveCall.findByPk(id, {
    attributes: ['id', 'recordingStorageKey', 'recordingDuration', 'startedAt', 'endedAt'],
    raw: true,
  })) as
    | {
        id: string
        recordingStorageKey: string | null
        recordingDuration: number | null
        startedAt: Date | null
        endedAt: Date | null
      }
    | null

  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!call.recordingStorageKey) {
    return NextResponse.json({ error: 'No recording for this call' }, { status: 404 })
  }

  let durationSec: number | null = null
  if (call.recordingDuration && Number.isFinite(call.recordingDuration)) {
    durationSec = call.recordingDuration
  } else if (call.startedAt && call.endedAt) {
    const ms = new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()
    if (Number.isFinite(ms) && ms > 0) durationSec = Math.round(ms / 1000)
  }

  try {
    const url = await getPresignedUrl(call.recordingStorageKey, 300)
    return NextResponse.json({ url, durationSec, expiresInSeconds: 300 })
  } catch (err) {
    console.error('[GET /api/calls/recording]', err)
    return NextResponse.json({ error: 'Failed to sign recording URL' }, { status: 500 })
  }
}
