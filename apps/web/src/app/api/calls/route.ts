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

  try {
    const calls = await ActiveCall.findAll({
      where: {
        // Live Calls panel only shows truly live calls. Excludes every
        // terminal state we know about (and is forward-compatible with
        // any new terminal status added later — whitelist live states
        // instead of blacklisting one).
        status: { [Op.in]: ['INITIATING', 'RINGING', 'ACTIVE'] },
        // Auto-prune anything that's been "live" for more than 30 minutes
        // — at that point either Telnyx already terminated the call and
        // we missed the webhook, or something is genuinely stuck. Either
        // way it shouldn't show as live. The /sweep endpoint below
        // marks these COMPLETED on a schedule; this filter is a belt
        // so the panel hides them even before the sweep runs.
        startedAt: { [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) },
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
