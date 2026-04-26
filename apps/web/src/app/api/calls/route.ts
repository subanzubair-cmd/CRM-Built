import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  Property,
  ActiveCall,
  PropertyTeamAssignment,
  LeadCampaign,
  TwilioNumber,
  User,
  Op,
} from '@crm/database'
import { z } from 'zod'
import {
  makeConferenceCall,
  generateConferenceName,
} from '@/lib/twilio-calls'
import { requirePermission, hasPermission } from '@/lib/auth-utils'
import { checkDndByPhone } from '@/lib/dnd'
import { rateLimitMutation } from '@/lib/rate-limit'

const InitiateCallSchema = z.object({
  customerPhone: z.string().min(7),
  propertyId: z.string().optional(),
  fromNumber: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const limited = rateLimitMutation(req, { bucket: 'calls.post', limit: 30 })
  if (limited) return limited
  const session = await auth()
  const deny = requirePermission(session, 'comms.send')
  if (deny) return deny

  const userId = ((session as any)?.user?.id ?? '') as string

  const agent = await User.findByPk(userId, {
    attributes: ['id', 'name', 'phone'],
  })

  if (!agent?.phone) {
    return NextResponse.json(
      { error: 'Your profile must have a phone number set before you can make calls. Go to Settings → Profile.' },
      { status: 422 },
    )
  }

  const body = await req.json()
  const parsed = InitiateCallSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { customerPhone, propertyId, fromNumber } = parsed.data

  let propertyContext: {
    id: string
    assignedToId: string | null
    defaultOutboundNumber: string | null
    leadCampaignId: string | null
    campaignNumber: string | null
  } | null = null

  if (propertyId) {
    const propertyRow = await Property.findByPk(propertyId, {
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
    if (!propertyRow) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }
    const property = propertyRow.get({ plain: true }) as any
    propertyContext = {
      id: property.id,
      assignedToId: property.assignedToId,
      defaultOutboundNumber: property.defaultOutboundNumber,
      leadCampaignId: property.leadCampaignId,
      campaignNumber: property.leadCampaign?.phoneNumber?.number ?? null,
    }

    const isAdmin = hasPermission(session, 'admin.all')
    if (!isAdmin) {
      const isAssignee = propertyContext.assignedToId === userId
      const teamAssignment = isAssignee
        ? null
        : await PropertyTeamAssignment.findOne({
            where: { propertyId, userId },
            attributes: ['id'],
            raw: true,
          })
      if (!isAssignee && !teamAssignment) {
        return NextResponse.json(
          { error: 'You are not on this property’s team.' },
          { status: 403 },
        )
      }
    }
  }

  const dndBlock = await checkDndByPhone(customerPhone, 'call')
  if (dndBlock) {
    return NextResponse.json({ error: dndBlock }, { status: 422 })
  }

  const resolvedFromNumber =
    fromNumber ??
    propertyContext?.defaultOutboundNumber ??
    propertyContext?.campaignNumber ??
    undefined

  const conferenceName = generateConferenceName()

  try {
    const { agentCallSid, customerCallSid } = await makeConferenceCall(
      agent.phone,
      customerPhone,
      conferenceName,
      resolvedFromNumber,
    )

    const activeCall = await ActiveCall.create({
      conferenceName,
      agentCallSid,
      customerCallSid,
      customerPhone,
      agentUserId: userId,
      ...(propertyContext ? { propertyId: propertyContext.id } : {}),
      ...(propertyContext?.leadCampaignId
        ? { leadCampaignId: propertyContext.leadCampaignId }
        : {}),
      status: 'INITIATING',
    } as any)

    return NextResponse.json({ success: true, data: activeCall }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/calls]', err)
    return NextResponse.json({ error: 'Failed to initiate call' }, { status: 500 })
  }
}

export async function GET(_req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.view')
  if (deny) return deny

  // Sweep stuck rows before serving. Without this, calls that fail
  // mid-dial (SDK never transitions past INITIATING because the network
  // dropped, the agent closed the tab before the call connected, the
  // call_control_id was never linked so the call.hangup webhook
  // couldn't match, etc.) sit in the Live Calls panel forever even
  // though there's no actual call running.
  //
  // Aggressive thresholds — these are MAXIMUMS for what's still
  // plausibly live; a healthy call never needs this long in any one
  // phase. Anything past this is stuck and should be treated as ended.
  //
  //   INITIATING > 2 min  → FAILED  (network dropped, SDK never connected)
  //   RINGING    > 5 min  → NO_ANSWER (Telnyx default ring is ~30s; 5min
  //                                    means a webhook was missed)
  //   ACTIVE     > 4 hours → COMPLETED (no real human call lasts that long)
  const now = Date.now()
  await Promise.all([
    ActiveCall.update(
      { status: 'FAILED', endedAt: new Date() } as any,
      {
        where: {
          status: 'INITIATING',
          startedAt: { [Op.lt]: new Date(now - 2 * 60 * 1000) },
        },
      },
    ).catch((err) => console.warn('[GET /api/calls] sweep INITIATING failed:', err)),
    ActiveCall.update(
      { status: 'NO_ANSWER', endedAt: new Date() } as any,
      {
        where: {
          status: 'RINGING',
          startedAt: { [Op.lt]: new Date(now - 5 * 60 * 1000) },
        },
      },
    ).catch((err) => console.warn('[GET /api/calls] sweep RINGING failed:', err)),
    ActiveCall.update(
      { status: 'COMPLETED', endedAt: new Date() } as any,
      {
        where: {
          status: 'ACTIVE',
          startedAt: { [Op.lt]: new Date(now - 4 * 60 * 60 * 1000) },
        },
      },
    ).catch((err) => console.warn('[GET /api/calls] sweep ACTIVE failed:', err)),
  ])

  try {
    const calls = await ActiveCall.findAll({
      where: {
        // Live Calls panel only shows truly live calls. Whitelist of
        // currently-active states; the sweep above pre-emptively
        // converts stuck rows so they're already excluded by the time
        // we read.
        status: { [Op.in]: ['INITIATING', 'RINGING', 'ACTIVE'] },
        // Hard ceiling: a healthy call shouldn't be older than 30 min;
        // anything older hides from the panel even if the sweep above
        // missed (e.g., DB error rolled back).
        startedAt: { [Op.gte]: new Date(now - 30 * 60 * 1000) },
      },
      include: [
        { model: User, as: 'agent', attributes: ['id', 'name', 'phone'] },
        { model: Property, as: 'property', attributes: ['id', 'streetAddress', 'city', 'propertyStatus'] },
      ],
      order: [['startedAt', 'DESC']],
    })

    return NextResponse.json({ data: calls.map((c) => c.get({ plain: true })) })
  } catch (err) {
    console.error('[GET /api/calls]', err)
    return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 })
  }
}
