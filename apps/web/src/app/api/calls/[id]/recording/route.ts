import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ActiveCall } from '@crm/database'
import { getPresignedUrl } from '@/lib/minio'

/**
 * GET /api/calls/[id]/recording
 *
 * Returns a short-lived presigned MinIO URL the audio player can use as
 * <audio src="…">. The CRM never exposes the underlying MinIO endpoint
 * to the browser long-term; the URL expires in 5 minutes.
 *
 * Returns 404 if the call has no recording yet (still in flight, or
 * recording feature was off when the call happened).
 */
type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const call = await ActiveCall.findByPk(id, {
    attributes: ['id', 'recordingStorageKey'],
    raw: true,
  }) as { id: string; recordingStorageKey: string | null } | null

  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!call.recordingStorageKey) {
    return NextResponse.json({ error: 'No recording for this call' }, { status: 404 })
  }

  try {
    const url = await getPresignedUrl(call.recordingStorageKey, 300)
    return NextResponse.json({ url, expiresInSeconds: 300 })
  } catch (err) {
    console.error('[GET /api/calls/recording]', err)
    return NextResponse.json({ error: 'Failed to sign recording URL' }, { status: 500 })
  }
}
