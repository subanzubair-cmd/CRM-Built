import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  Property,
  PropertyContact,
  Contact,
  StageHistory,
  ActivityLog,
  LeadCampaign,
  TwilioNumber,
  LeadSource,
  Op,
  sequelize,
} from '@crm/database'
import { z } from 'zod'
import { normalizeAddress } from '@crm/shared'
import { enqueueAutomation } from '@/lib/queue'
import { requirePermission } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { emitEvent, DomainEvents } from '@/lib/domain-events'
import { pickAssigneeForNewLead } from '@/lib/lead-assignment'
import { autoPopulateTeam } from '@/lib/team-assignment'

const CreateLeadSchema = z.object({
  // Optional — inbound calls/SMS create leads before the address is
  // known, and the agent fills it in later. Manual leads can also
  // start with name+phone only and have the address backfilled.
  streetAddress: z.string().optional(),
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

  if (!skipDuplicateCheck) {
    const duplicate = await Property.findOne({
      where: { normalizedAddress: normalized },
      attributes: ['id', 'propertyStatus', 'streetAddress'],
      raw: true,
    })
    if (duplicate) {
      return NextResponse.json({
        success: false,
        duplicateWarning: {
          existingId: (duplicate as any).id,
          existingAddress: (duplicate as any).streetAddress ?? '',
          existingStatus: (duplicate as any).propertyStatus ?? 'ACTIVE',
          message: 'A lead with this address already exists',
        },
      }, { status: 409 })
    }
  }

  let initialOutboundNumber: string | null = null
  let derivedSource: string | null | undefined = propertyData.source
  if (propertyData.leadCampaignId) {
    const lc = await LeadCampaign.findByPk(propertyData.leadCampaignId, {
      include: [
        { model: TwilioNumber, as: 'phoneNumber' },
        { model: LeadSource, as: 'leadSource' },
      ],
    })
    if (!lc) {
      return NextResponse.json({ error: 'Lead campaign not found' }, { status: 422 })
    }
    const lcPlain = lc.get({ plain: true }) as any
    const expectedType = propertyData.leadType === 'DIRECT_TO_SELLER' ? 'DTS' : 'DTA'
    if (lcPlain.type && lcPlain.type !== expectedType) {
      return NextResponse.json(
        { error: `Campaign type ${lcPlain.type} does not match lead type ${propertyData.leadType}` },
        { status: 422 },
      )
    }
    initialOutboundNumber = lcPlain.phoneNumber?.number ?? null
    if (!derivedSource && lcPlain.leadSource?.name) derivedSource = lcPlain.leadSource.name
  }

  const finalOutboundNumber =
    propertyData.defaultOutboundNumber && propertyData.defaultOutboundNumber.trim()
      ? propertyData.defaultOutboundNumber.trim()
      : initialOutboundNumber

  try {
    const updatedProperty = await sequelize.transaction(async (tx) => {
      const property = await Property.create({
        ...propertyData,
        source: derivedSource ?? null,
        ...(finalOutboundNumber ? { defaultOutboundNumber: finalOutboundNumber } : {}),
        normalizedAddress: normalized,
        createdById: userId,
        activeLeadStage: 'NEW_LEAD',
      } as any, { transaction: tx })

      await StageHistory.create({
        propertyId: property.id,
        pipeline: 'leads',
        toStage: 'NEW_LEAD',
        changedById: userId,
        changedByName: userName,
      } as any, { transaction: tx })

      await ActivityLog.create({
        propertyId: property.id,
        userId,
        action: 'LEAD_CREATED',
        detail: { description: `Lead created from ${propertyData.source ?? 'manual entry'}` },
      } as any, { transaction: tx })

      const contact = await Contact.create({
        type: propertyData.leadType === 'DIRECT_TO_SELLER' ? 'SELLER' : 'AGENT',
        firstName: contactFirstName,
        lastName: contactLastName ?? '',
        phone: contactPhone ?? null,
        email: contactEmail ?? null,
      } as any, { transaction: tx })

      await PropertyContact.create({
        propertyId: property.id,
        contactId: contact.id,
        isPrimary: true,
      } as any, { transaction: tx })

      const now = new Date()
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const startOfMonth = new Date(yyyy, now.getMonth(), 1)
      const countThisMonth = await Property.count({
        where: { createdAt: { [Op.gte]: startOfMonth } },
        transaction: tx,
      })
      const leadNumber = `HP-${yyyy}${mm}-${String(countThisMonth).padStart(4, '0')}`
      await property.update({ leadNumber }, { transaction: tx })
      return property
    })

    enqueueAutomation({ trigger: 'LEAD_CREATED', propertyId: updatedProperty.id })
    void emitEvent({
      type: DomainEvents.LEAD_CREATED,
      propertyId: updatedProperty.id,
      userId,
      actorType: 'user',
      payload: { source: propertyData.source ?? 'manual', leadNumber: (updatedProperty as any).leadNumber },
    })

    if (!propertyData.assignedToId && propertyData.leadCampaignId) {
      void (async () => {
        const assigneeId = await pickAssigneeForNewLead(propertyData.leadCampaignId!)
        if (assigneeId) {
          await Property.update(
            { assignedToId: assigneeId },
            { where: { id: updatedProperty.id } },
          ).catch((e) => console.error('[leads] auto-assign failed:', e))
        }
      })()
    }

    if (propertyData.leadCampaignId) {
      void autoPopulateTeam(updatedProperty.id, propertyData.leadCampaignId, userId)
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
