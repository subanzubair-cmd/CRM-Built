import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ActiveCall, Property, User } from '@crm/database'
import { getPresignedUrl } from '@/lib/minio'
import { buildRecordingDownloadName } from '@/lib/recording-label'

/**
 * GET /api/calls/[id]/recording
 *
 * Returns a short-lived presigned MinIO URL plus everything the player
 * needs to render its header line and force a meaningful download
 * filename:
 *
 *   url              presigned MinIO URL (5-minute expiry)
 *   durationSec      derived from recordingDuration or (endedAt - startedAt)
 *   expiresInSeconds always 300
 *   propertyAddress  ActiveCall.propertyId → Property.streetAddress, or null
 *   startedAt        ISO string of ActiveCall.startedAt
 *   agentName        ActiveCall.agentUserId → User.name, or null
 *   downloadName     server-built filename, e.g.
 *                    "333 Preston Road - 27m 30s - 05-04-2026 - Admin.webm"
 *                    Gracefully degrades — missing parts are dropped, never
 *                    blocks the download. Worst case: "Call Recording.webm".
 *
 * Duration is derived in priority order:
 *   1) ActiveCall.recordingDuration (set by post-processing)
 *   2) (endedAt - startedAt) — accurate for the live MediaRecorder pipeline
 *      where the recording covers the full call lifetime
 *
 * The 2nd path matters because MediaRecorder's WebM output frequently has
 * duration=Infinity in browser metadata (no Cues element written), so the
 * scrubber would otherwise be unusable.
 */
type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const call = (await ActiveCall.findByPk(id, {
    attributes: [
      'id',
      'recordingStorageKey',
      'recordingDuration',
      'startedAt',
      'endedAt',
      'propertyId',
      'agentUserId',
    ],
    raw: true,
  })) as
    | {
        id: string
        recordingStorageKey: string | null
        recordingDuration: number | null
        startedAt: Date | null
        endedAt: Date | null
        propertyId: string | null
        agentUserId: string | null
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

  // Look up address + agent name in parallel. Both are PK lookups so they're
  // cheap; we keep them out of the ActiveCall query to avoid wiring
  // association aliases just for two simple joins.
  const [propertyRow, agentRow] = await Promise.all([
    call.propertyId
      ? (Property.findByPk(call.propertyId, { attributes: ['streetAddress'], raw: true }) as Promise<
          { streetAddress: string | null } | null
        >)
      : Promise.resolve(null),
    call.agentUserId
      ? (User.findByPk(call.agentUserId, { attributes: ['name'], raw: true }) as Promise<
          { name: string | null } | null
        >)
      : Promise.resolve(null),
  ])

  const propertyAddress = propertyRow?.streetAddress?.trim() || null
  const agentName = agentRow?.name?.trim() || null
  const startedAt = call.startedAt ?? null

  const downloadName = buildRecordingDownloadName({
    propertyAddress,
    durationSec,
    startedAt,
    agentName,
    storageKey: call.recordingStorageKey,
  })

  try {
    const url = await getPresignedUrl(call.recordingStorageKey, 300)
    return NextResponse.json({
      url,
      durationSec,
      expiresInSeconds: 300,
      propertyAddress,
      startedAt: startedAt ? new Date(startedAt).toISOString() : null,
      agentName,
      downloadName,
    })
  } catch (err) {
    console.error('[GET /api/calls/recording]', err)
    return NextResponse.json({ error: 'Failed to sign recording URL' }, { status: 500 })
  }
}
