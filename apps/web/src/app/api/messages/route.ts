import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import {
  Contact,
  PropertyContact,
  Property,
  Conversation,
  Message,
  ActivityLog,
  Op,
  sequelize,
} from '@crm/database'
import { z } from 'zod'
import { emitEvent, DomainEvents } from '@/lib/domain-events'

const LogMessageSchema = z.object({
  propertyId: z.string().min(1),
  channel: z.enum(['CALL', 'NOTE', 'EMAIL', 'SMS']),
  body: z.string().min(1).max(10000),
  subject: z.string().optional(),
  direction: z.enum(['INBOUND', 'OUTBOUND']).default('OUTBOUND'),
  contactId: z.string().optional(),
  contactPhone: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.send')
  if (deny) return deny
  const userId = ((session as any)?.user?.id ?? '') as string

  const body = await req.json()
  const parsed = LogMessageSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { propertyId, channel, body: messageBody, subject, direction, contactId, contactPhone } = parsed.data

  // Resolve contactId if not passed: prefer primary contact, fall back to contact matching phone
  let resolvedContactId: string | null = contactId ?? null
  if (!resolvedContactId && contactPhone) {
    const contact = await Contact.findOne({
      where: { [Op.or]: [{ phone: contactPhone }, { phone2: contactPhone }] },
      attributes: ['id'],
    })
    resolvedContactId = contact?.id ?? null
  }
  if (!resolvedContactId) {
    const primary = await PropertyContact.findOne({
      where: { propertyId, isPrimary: true },
      attributes: ['contactId'],
    })
    resolvedContactId = primary?.contactId ?? null
  }

  // Resolve leadCampaignId for attribution
  const property = await Property.findByPk(propertyId, {
    attributes: ['leadCampaignId'],
  })
  const leadCampaignId = property?.leadCampaignId ?? null

  // Per-contact Conversation (one thread per propertyId+contactId).
  // Null contactId is allowed but the unique index treats it as a single
  // bucket per property — matches Prisma's @@unique([propertyId, contactId])
  // semantics (Postgres NULLs are distinct, so multiple null-contact
  // conversations could in theory exist; we mirror that ambiguity by
  // using `findOne` with `null` rather than a strict findOrCreate).
  let conversation = resolvedContactId
    ? await Conversation.findOne({
        where: { propertyId, contactId: resolvedContactId },
      })
    : await Conversation.findOne({ where: { propertyId, contactId: null } })

  if (!conversation) {
    conversation = await Conversation.create({
      propertyId,
      contactId: resolvedContactId,
      contactPhone: contactPhone ?? null,
      isRead: true,
      lastMessageAt: new Date(),
    })
  } else {
    await conversation.update({ lastMessageAt: new Date(), isRead: true })
  }

  // Wrap the message + activity-log + property timestamp in a single
  // transaction so a failure in any one step rolls back the others.
  const message = await sequelize.transaction(async (tx) => {
    const created = await Message.create(
      {
        propertyId,
        conversationId: conversation!.id,
        contactId: resolvedContactId,
        leadCampaignId,
        channel,
        direction,
        body: messageBody,
        subject: subject ?? null,
        sentById: userId,
      },
      { transaction: tx },
    )
    await ActivityLog.create(
      {
        propertyId,
        userId,
        action: 'MESSAGE_LOGGED',
        detail: {
          description: `${channel} ${direction === 'INBOUND' ? 'received' : 'logged'}`,
        },
      },
      { transaction: tx },
    )
    await Property.update(
      { lastActivityAt: new Date() },
      { where: { id: propertyId }, transaction: tx },
    )
    return created
  })

  // Emit domain event
  await emitEvent({
    type: DomainEvents.COMMUNICATION_LOGGED,
    propertyId,
    userId,
    actorType: 'user',
    payload: { channel, direction, messageId: message.id },
  })

  return NextResponse.json({ success: true, data: message }, { status: 201 })
}
