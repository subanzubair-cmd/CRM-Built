import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ActiveCall } from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'

/**
 * GET /api/calls/[id]/cost
 *
 * Returns the per-call cost captured by the Telnyx call.hangup webhook
 * (or the CDR fallback if cost wasn't in the inline payload). Used by
 * the Call Disposition modal to append "$0.0023" to the activity log
 * entry so the agent + the team see what each call cost.
 *
 * Cost may be null if:
 *   - enableCallCost is OFF in CommProviderConfig
 *   - The webhook hasn't fired yet (race — modal opened immediately
 *     after end-of-call and the hangup webhook is a few hundred ms behind)
 *   - The CDR fetch (8s delay fallback) is still pending
 *
 * Caller is expected to handle null gracefully.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.view')
  if (deny) return deny

  const { id } = await params
  const row = await ActiveCall.findByPk(id, {
    attributes: ['id', 'cost', 'costCurrency', 'status', 'startedAt', 'endedAt'],
    raw: true,
  }) as any
  if (!row) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }
  return NextResponse.json({
    callId: row.id,
    cost: row.cost != null ? Number(row.cost) : null,
    costCurrency: row.costCurrency ?? null,
    status: row.status,
  })
}
