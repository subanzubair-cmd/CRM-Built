import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { User } from '@crm/database'
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

/**
 * POST /api/calls
 * Initiate an outbound conference call. Enforces:
 * - caller must be on property's team (assignedToId OR PropertyTeamAssignment) unless admin
 * - customer must not be on Do Not Call list
 * - outbound number falls back: fromNumber → property.defaultOutboundNumber → campaign.phoneNumber → env default
 * - persists leadCampaignId for ROI attribution
 */
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

  // Resolve property context (for team auth, attribution, and number fallback)
  let propertyContext: {
    id: string
    assignedToId: string | null
    defaultOutboundNumber: string | null
    leadCampaignId: string | null
    campaignNumber: string | null
  } | null = null

  if (propertyId) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        assignedToId: true,
        defaultOutboundNumber: true,
        leadCampaignId: true,
        leadCampaign: { select: { phoneNumber: { select: { number: true } } } },
      },
    })
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }
    propertyContext = {
      id: property.id,
      assignedToId: property.assignedToId,
      defaultOutboundNumber: property.defaultOutboundNumber,
      leadCampaignId: property.leadCampaignId,
      campaignNumber: property.leadCampaign?.phoneNumber?.number ?? null,
    }

    // Team-membership check (unless admin)
    const isAdmin = hasPermission(session, 'admin.all')
    if (!isAdmin) {
      const isAssignee = propertyContext.assignedToId === userId
      const teamAssignment = isAssignee
        ? null
        : await (prisma as any).propertyTeamAssignment.findFirst({
            where: { propertyId, userId },
            select: { id: true },
          })
      if (!isAssignee && !teamAssignment) {
        return NextResponse.json(
          { error: 'You are not on this property\u2019s team.' },
          { status: 403 },
        )
      }
    }
  }

  // DND check
  const dndBlock = await checkDndByPhone(customerPhone, 'call')
  if (dndBlock) {
    return NextResponse.json({ error: dndBlock }, { status: 422 })
  }

  // Resolve outbound caller ID — user override > property default > campaign > env
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

    const activeCall = await (prisma as any).activeCall.create({
      data: {
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
      },
    })

    return NextResponse.json({ success: true, data: activeCall }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/calls]', err)
    return NextResponse.json({ error: 'Failed to initiate call' }, { status: 500 })
  }
}

/**
 * GET /api/calls
 * List all non-completed active calls (for supervisor dashboard).
 */
export async function GET(_req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.view')
  if (deny) return deny

  try {
    const calls = await (prisma as any).activeCall.findMany({
      where: {
        status: { not: 'COMPLETED' },
      },
      include: {
        agent: { select: { id: true, name: true, phone: true } },
        property: { select: { id: true, streetAddress: true, city: true, propertyStatus: true } },
      },
      orderBy: { startedAt: 'desc' },
    })

    return NextResponse.json({ data: calls })
  } catch (err) {
    console.error('[GET /api/calls]', err)
    return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 })
  }
}
