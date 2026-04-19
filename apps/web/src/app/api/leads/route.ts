import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { normalizeAddress } from '@crm/shared'
import { enqueueAutomation } from '@/lib/queue'
import { requirePermission } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { emitEvent, DomainEvents } from '@/lib/domain-events'
import { pickAssigneeForNewLead } from '@/lib/lead-assignment'
import { autoPopulateTeam } from '@/lib/team-assignment'

const CreateLeadSchema = z.object({
  streetAddress: z.string().min(1),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  leadType: z.enum(['DIRECT_TO_SELLER', 'DIRECT_TO_AGENT']),
  marketId: z.string().optional(),
  source: z.string().optional(),
  leadCampaignId: z.string().optional(),
  defaultOutboundNumber: z.string().optional(),
  assignedToId: z.string().optional(),
  contactFirstName: z.string().min(1, 'Contact first name is required'),
  contactLastName: z.string().optional(),
  contactPhone: z.string().min(1, 'Contact phone number is required'),
  contactEmail: z.string().optional(),
  skipDuplicateCheck: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const session = await auth()
  const deny = requirePermission(session, 'leads.create')
  if (deny) return deny
  const sessionUser = (session as any)?.user ?? {}
  const userId = sessionUser.id as string
  const userName = (sessionUser.name ?? 'Unknown') as string

  const body = await req.json()
  const parsed = CreateLeadSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { contactFirstName, contactLastName, contactPhone, contactEmail, skipDuplicateCheck, ...propertyData } = parsed.data

  const normalized = normalizeAddress(
    propertyData.streetAddress,
    propertyData.city ?? null,
    propertyData.state ?? null,
    propertyData.zip ?? null,
  )

  // Duplicate detection — warn (not block) if an existing property has the same normalized address
  let duplicateWarning: {
    existingId: string
    existingAddress: string
    existingStatus: string
    message: string
  } | null = null

  if (!skipDuplicateCheck) {
    const duplicate = await prisma.property.findFirst({
      where: { normalizedAddress: normalized },
      select: { id: true, propertyStatus: true, streetAddress: true },
    })
    if (duplicate) {
      // Block creation — return duplicate info so frontend can offer to view existing
      return NextResponse.json({
        success: false,
        duplicateWarning: {
          existingId: duplicate.id,
          existingAddress: duplicate.streetAddress ?? '',
          existingStatus: duplicate.propertyStatus ?? 'ACTIVE',
          message: 'A lead with this address already exists',
        },
      }, { status: 409 })
    }
  }

  // If a Lead Campaign is referenced: validate type match, pull phone number,
  // and derive source. Per user clarification: campaign number →
  // property.defaultOutboundNumber at creation; user-set values stay on top later.
  let initialOutboundNumber: string | null = null
  let derivedSource: string | null | undefined = propertyData.source
  if (propertyData.leadCampaignId) {
    const lc = await prisma.leadCampaign.findUnique({
      where: { id: propertyData.leadCampaignId },
      include: { phoneNumber: true, leadSource: true },
    })
    if (!lc) {
      return NextResponse.json({ error: 'Lead campaign not found' }, { status: 422 })
    }
    const expectedType = propertyData.leadType === 'DIRECT_TO_SELLER' ? 'DTS' : 'DTA'
    if (lc.type && lc.type !== expectedType) {
      return NextResponse.json(
        { error: `Campaign type ${lc.type} does not match lead type ${propertyData.leadType}` },
        { status: 422 },
      )
    }
    initialOutboundNumber = lc.phoneNumber?.number ?? null
    if (!derivedSource && lc.leadSource?.name) derivedSource = lc.leadSource.name
  }

  // User-supplied defaultOutboundNumber overrides the campaign-derived value.
  const finalOutboundNumber =
    propertyData.defaultOutboundNumber && propertyData.defaultOutboundNumber.trim()
      ? propertyData.defaultOutboundNumber.trim()
      : initialOutboundNumber

  try {
    const property = await prisma.property.create({
      data: {
        ...propertyData,
        source: derivedSource ?? null,
        ...(finalOutboundNumber ? { defaultOutboundNumber: finalOutboundNumber } : {}),
        normalizedAddress: normalized,
        createdById: userId,
        activeLeadStage: 'NEW_LEAD',
        stageHistory: {
          create: {
            pipeline: 'leads',
            toStage: 'NEW_LEAD',
            changedById: userId,
            changedByName: userName,
          },
        },
        activityLogs: {
          create: {
            userId: userId,
            action: 'LEAD_CREATED',
            detail: { description: `Lead created from ${propertyData.source ?? 'manual entry'}` },
          },
        },
        contacts: {
          create: {
            isPrimary: true,
            contact: {
              create: {
                type: propertyData.leadType === 'DIRECT_TO_SELLER' ? 'SELLER' : 'AGENT',
                firstName: contactFirstName,
                lastName: contactLastName ?? '',
                phone: contactPhone ?? null,
                email: contactEmail ?? null,
              },
            },
          },
        },
      },
    })

    // Generate lead number: HP-{YYYYMM}-{seq}
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const startOfMonth = new Date(yyyy, now.getMonth(), 1)
    const countThisMonth = await prisma.property.count({
      where: { createdAt: { gte: startOfMonth } },
    })
    const leadNumber = `HP-${yyyy}${mm}-${String(countThisMonth).padStart(4, '0')}`
    const updatedProperty = await prisma.property.update({
      where: { id: property.id },
      data: { leadNumber },
    })

    // Fire-and-forget: automation + domain event (don't block response)
    enqueueAutomation({ trigger: 'LEAD_CREATED', propertyId: property.id })
    void emitEvent({
      type: DomainEvents.LEAD_CREATED,
      propertyId: property.id,
      userId,
      actorType: 'user',
      payload: { source: propertyData.source ?? 'manual', leadNumber },
    })

    // Fire-and-forget: round-robin primary assignment if not already assigned
    if (!propertyData.assignedToId && propertyData.leadCampaignId) {
      void (async () => {
        const assigneeId = await pickAssigneeForNewLead(propertyData.leadCampaignId!)
        if (assigneeId) {
          await prisma.property.update({
            where: { id: property.id },
            data: { assignedToId: assigneeId },
          }).catch((e) => console.error('[leads] auto-assign failed:', e))
        }
      })()
    }

    // Fire-and-forget: auto-populate PropertyTeamAssignment for every
    // enabled role on the campaign with at least one eligible user
    if (propertyData.leadCampaignId) {
      void autoPopulateTeam(property.id, propertyData.leadCampaignId, userId)
    }

    return NextResponse.json(
      { success: true, data: updatedProperty },
      { status: 201 },
    )
  } catch (err: any) {
    console.error('[leads] POST create failed:', err)
    return NextResponse.json(
      { error: err?.message ?? 'Failed to create lead' },
      { status: 500 },
    )
  }
}
