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

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/calls/[id]/reject
 *
 * Reject an inbound ringing call. Authorization mirrors /answer:
 * admin, assigned agent, property assignee, or team member.
 *
 * Reject ALWAYS terminates the parent call at the provider — there's
 * no "soft" mode. We POST `/v2/calls/{call_control_id}/actions/hangup`
 * to Telnyx (when the active provider is Telnyx and we have a real
 * call_control_id) so the caller's device disconnects immediately,
 * just like a normal mobile-phone reject.
 *
 * The earlier soft/hard toggle was removed: the soft path was only
 * useful as an in-CRM dismiss, and users found the inconsistency
 * confusing — a Reject button that left the caller ringing isn't
 * really a reject.
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

  // ─── AuthZ ───────────────────────────────────────────────────────
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

  // ─── Provider hangup FIRST ───────────────────────────────────────
  //
  // Done before the local DB update so the parent call_control_id is
  // killed regardless of any race with the call.hangup webhook moving
  // us to COMPLETED. Also done for ANY ActiveCall status — hanging up
  // an already-ended Telnyx call is a 422 no-op, not a real error,
  // so the worst case is a logged warning.
  const conferenceName = (call as any).conferenceName as string | null

  // A real Telnyx call_control_id is a long base64-ish string. When
  // /api/calls/[id]/link-control-id failed to overwrite the
  // placeholder we wrote at /start time, conferenceName is still
  // `webrtc-{ts}-{rand}` and POSTing it to Telnyx is guaranteed to
  // 404. Skip the call but surface a clearer error.
  const isPlaceholderCallId = (s: string | null | undefined): boolean =>
    !!s && /^webrtc-\d+-[a-z0-9]+$/i.test(s)

  console.log(
    `[calls/reject] id=${id} status=${call.status} ` +
      `conferenceName=${conferenceName ? conferenceName.slice(0, 12) + '…' : '(missing)'}`,
  )

  const providerHangup: {
    attempted: boolean
    ok: boolean
    status: number | null
    detail: string | null
  } = { attempted: false, ok: false, status: null, detail: null }

  if (conferenceName && !isPlaceholderCallId(conferenceName)) {
    const config = await getActiveCommConfig()
    if (config?.providerName === 'telnyx' && config.apiKey) {
      providerHangup.attempted = true

      // We try BOTH commands and accept whichever Telnyx accepts:
      //
      //   /actions/hangup — universal: works on parent calls in any
      //   state (ringing, bridging, active). The "right" command for
      //   killing a call once we know we don't want it.
      //
      //   /actions/reject — only valid on calls in `parked` /
      //   `ringing` state on Voice API Application flows. Sends 486
      //   / 603 with a SIP cause. Some Telnyx Voice Application
      //   configurations need this specifically because /hangup on
      //   a not-yet-answered call can route to the application's
      //   no-answer treatment instead.
      //
      // Whichever returns 2xx is treated as success. We log BOTH
      // responses so when a reject doesn't seem to work we can see
      // exactly what Telnyx said back.

      const tryAction = async (action: 'reject' | 'hangup') => {
        const url = `https://api.telnyx.com/v2/calls/${encodeURIComponent(conferenceName)}/actions/${action}`
        const body = action === 'reject' ? { cause: 'CALL_REJECTED' } : {}
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          })
          const txt = res.ok ? '' : (await res.text().catch(() => '')).slice(0, 400)
          console.log(
            `[calls/reject] Telnyx ${action} → ${res.status} ${res.ok ? 'OK' : 'FAIL'} ` +
              `(callControlId=${conferenceName.slice(0, 16)}…) ${txt}`,
          )
          return { ok: res.ok, status: res.status, detail: txt || null }
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err)
          console.warn(`[calls/reject] Telnyx ${action} threw:`, detail)
          return { ok: false, status: 0, detail }
        }
      }

      // Step 1: /actions/hangup (more universal — works in any
      // state including bridging/active, which is where we usually
      // are when a SIP user has been routed but hasn't answered).
      const hangupResult = await tryAction('hangup')
      providerHangup.status = hangupResult.status
      providerHangup.ok = hangupResult.ok
      providerHangup.detail = hangupResult.detail

      // Step 2: only if /hangup didn't take, try /reject — some
      // Voice App configurations refuse hangup on still-ringing
      // calls and need an explicit reject.
      if (!hangupResult.ok) {
        const rejectResult = await tryAction('reject')
        if (rejectResult.ok) {
          providerHangup.status = rejectResult.status
          providerHangup.ok = true
          providerHangup.detail = `hangup failed (${hangupResult.status}: ${hangupResult.detail}), reject OK`
        } else {
          providerHangup.detail = `hangup ${hangupResult.status}: ${hangupResult.detail}; reject ${rejectResult.status}: ${rejectResult.detail}`
        }
      }
    } else {
      providerHangup.detail =
        config?.providerName === 'telnyx'
          ? 'Telnyx API Key missing in Settings → SMS & Phone Number Integration'
          : `Provider "${config?.providerName ?? 'none'}" doesn’t support reject yet`
      console.warn('[calls/reject] reject skipped at provider:', providerHangup.detail)
    }
  } else if (!conferenceName) {
    providerHangup.detail = 'No conferenceName / call_control_id on ActiveCall row'
    console.warn('[calls/reject] reject skipped at provider: missing conferenceName')
  } else {
    providerHangup.detail =
      'ActiveCall.conferenceName is still the placeholder "webrtc-..." — link-control-id never overwrote it, so we have no real Telnyx call_control_id to hang up.'
    console.warn('[calls/reject] reject skipped at provider: placeholder conferenceName')
  }

  // ─── Local DB transition (best-effort) ───────────────────────────
  const [count] = await ActiveCall.update(
    {
      status: 'REJECTED',
      rejectedReason: body.reason ?? 'declined',
      endedAt: new Date(),
    },
    { where: { id, status: { [Op.in]: ['INITIATING', 'RINGING'] } } },
  )

  const refreshed = await ActiveCall.findByPk(id)
  return NextResponse.json({
    success: true,
    data: refreshed,
    providerHangup,
    localTransition: count > 0 ? 'REJECTED' : 'already-ended',
  })
}
