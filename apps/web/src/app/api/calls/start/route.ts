import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  ActiveCall,
  Property,
  LeadCampaign,
  TwilioNumber,
} from '@crm/database'
import { z } from 'zod'
import { requirePermission, hasPermission } from '@/lib/auth-utils'
import { checkDndByPhone } from '@/lib/dnd'
import { rateLimitMutation } from '@/lib/rate-limit'
import { getActiveCommConfig } from '@/lib/comm-provider'

/**
 * POST /api/calls/start — WebRTC variant of /api/calls.
 *
 * Creates the ActiveCall row server-side BEFORE the browser's
 * TelnyxRTC.newCall() so we have an id to attach recording chunks to
 * and a single source of truth for the call lifecycle.
 *
 * Returns the resolved sender (callerNumber) — same fallback chain as
 * the conference-call route: explicit fromNumber → property's
 * defaultOutboundNumber → campaign phone → comm config default.
 */
const Schema = z.object({
  toNumber: z.string().min(7),
  fromNumber: z.string().optional(),
  propertyId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const limited = rateLimitMutation(req, { bucket: 'calls.start', limit: 60 })
  if (limited) return limited

  const session = await auth()
  const deny = requirePermission(session, 'comms.send')
  if (deny) return deny

  const userId = ((session as any)?.user?.id ?? '') as string
  const body = await req.json().catch(() => ({}))
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { toNumber, fromNumber, propertyId } = parsed.data

  // DND check
  const dndBlock = await checkDndByPhone(toNumber, 'call')
  if (dndBlock) {
    return NextResponse.json({ error: dndBlock }, { status: 422 })
  }

  // Resolve property + campaign + sender (same logic as the conference
  // route). Drops here so a single call site can be reused later if we
  // unify the two routes.
  let propertyContext: {
    id: string
    assignedToId: string | null
    defaultOutboundNumber: string | null
    leadCampaignId: string | null
    campaignNumber: string | null
  } | null = null

  if (propertyId) {
    const propRow = await Property.findByPk(propertyId, {
      attributes: ['id', 'assignedToId', 'defaultOutboundNumber', 'leadCampaignId'],
      include: [
        {
          model: LeadCampaign,
          as: 'leadCampaign',
          attributes: ['id'],
          include: [{ model: TwilioNumber, as: 'phoneNumber', attributes: ['number'] }],
        },
      ],
    })
    if (!propRow) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    const p = propRow.get({ plain: true }) as any
    propertyContext = {
      id: p.id,
      assignedToId: p.assignedToId,
      defaultOutboundNumber: p.defaultOutboundNumber,
      leadCampaignId: p.leadCampaignId,
      campaignNumber: p.leadCampaign?.phoneNumber?.number ?? null,
    }

    const isAdmin = hasPermission(session, 'admin.all')
    if (!isAdmin && propertyContext.assignedToId !== userId) {
      // Soft check — calling unrelated leads is unusual but allowed for now.
    }
  }

  // Final fallback: the active comm provider's `defaultNumber`
  // (Settings → SMS & Phone Number Integration → Default Outbound
  // Number). Without this fallback, calling a property that has no
  // defaultOutboundNumber AND no campaign phone leaves callerNumber
  // empty — the browser SDK still dials (using its own default) but
  // we can't persist crmNumber, so the activity row shows no From/To.
  const commConfig = await getActiveCommConfig()
  const callerNumber =
    fromNumber ||
    propertyContext?.defaultOutboundNumber ||
    propertyContext?.campaignNumber ||
    commConfig?.defaultNumber ||
    ''

  const conferenceName = `webrtc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  const call = await ActiveCall.create({
    conferenceName,
    customerPhone: toNumber,
    // crmNumber = the agent's outbound caller-ID (the number we dialed
    // FROM). Lets /api/messages auto-fill Message.from on the
    // disposition save so the activity row always shows both sides.
    crmNumber: callerNumber || null,
    direction: 'OUTBOUND',
    status: 'INITIATING',
    agentUserId: userId,
    ...(propertyContext ? { propertyId: propertyContext.id } : {}),
    ...(propertyContext?.leadCampaignId ? { leadCampaignId: propertyContext.leadCampaignId } : {}),
  } as any)

  return NextResponse.json({
    id: call.id,
    callerNumber,
    customerPhone: toNumber,
    propertyId: propertyContext?.id ?? null,
  }, { status: 201 })
}
