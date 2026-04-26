import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  ActiveCall,
  Property,
  PropertyTeamAssignment,
  Op,
} from '@crm/database'
import { requirePermission, hasPermission } from '@/lib/auth-utils'
import { getActiveCommConfig } from '@/lib/comm-provider'
import { getCompanySettings } from '@/lib/company-settings'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/calls/[id]/reject
 * Reject an inbound ringing call. Authorization mirrors /answer:
 * admin, assigned agent, property assignee, or team member.
 * Atomic transition prevents races with a concurrent /answer.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.send')
  if (deny) return deny
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const call = await ActiveCall.findByPk(id, {
    attributes: ['id', 'status', 'agentUserId', 'propertyId', 'conferenceName'],
  })
  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  const isAdmin = hasPermission(session, 'admin.all')
  if (!isAdmin && call.agentUserId !== userId) {
    let isPropertyAssignee = false
    if (call.propertyId) {
      const property = await Property.findByPk(call.propertyId, {
        attributes: ['assignedToId'],
      })
      isPropertyAssignee = property?.assignedToId === userId
    }
    const teamMember = isPropertyAssignee || !call.propertyId
      ? null
      : await PropertyTeamAssignment.findOne({
          where: { propertyId: call.propertyId, userId },
          attributes: ['id'],
        })
    if (!isPropertyAssignee && !teamMember) {
      return NextResponse.json(
        { error: 'You are not authorized to reject this call.' },
        { status: 403 },
      )
    }
  }

  const [count] = await ActiveCall.update(
    {
      status: 'REJECTED',
      rejectedReason: body.reason ?? 'declined',
      endedAt: new Date(),
    },
    { where: { id, status: { [Op.in]: ['INITIATING', 'RINGING'] } } },
  )

  if (count === 0) {
    return NextResponse.json(
      { error: 'Call is no longer available to reject.' },
      { status: 409 },
    )
  }

  // Honor the rejectMode CompanySetting:
  //   'soft' → only mark REJECTED in our DB; the caller keeps ringing
  //            until Telnyx times out (~30s). Acts as a "snooze" so the
  //            caller can still leave a voicemail.
  //   'hard' → also POST a hangup to the provider so the caller's
  //            device disconnects immediately, just like a normal
  //            mobile-phone reject.
  // We use the conferenceName column — for Telnyx that's the
  // call_control_id; for Twilio that's the conference SID. Fire-and-
  // forget so the API call doesn't block the rejection response.
  const { rejectMode } = await getCompanySettings()
  const conferenceName = (call as any).conferenceName as string | null
  if (rejectMode === 'hard' && conferenceName) {
    const config = await getActiveCommConfig()
    if (config?.providerName === 'telnyx' && config.apiKey) {
      void fetch(
        `https://api.telnyx.com/v2/calls/${encodeURIComponent(conferenceName)}/actions/hangup`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      )
        .then(async (res) => {
          if (!res.ok) {
            const txt = await res.text().catch(() => '')
            console.warn(
              `[calls/reject] Telnyx hangup ${res.status} for ${conferenceName}: ${txt.slice(0, 200)}`,
            )
          }
        })
        .catch((err) => console.warn('[calls/reject] Telnyx hangup failed:', err))
    }
    // Twilio: handled via TwiML response on the original webhook,
    // which is a separate flow. No-op here.
  }

  const refreshed = await ActiveCall.findByPk(id)
  return NextResponse.json({ success: true, data: refreshed })
}
