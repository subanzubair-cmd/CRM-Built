import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
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
    const contact = await prisma.contact.findFirst({
      where: { OR: [{ phone: contactPhone }, { phone2: contactPhone }] },
      select: { id: true },
    })
    resolvedContactId = contact?.id ?? null
  }
  if (!resolvedContactId) {
    const primary = await prisma.propertyContact.findFirst({
      where: { propertyId, isPrimary: true },
      select: { contactId: true },
    })
    resolvedContactId = primary?.contactId ?? null
  }

  // Resolve leadCampaignId for attribution
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { leadCampaignId: true },
  })
  const leadCampaignId = property?.leadCampaignId ?? null

  // Per-contact Conversation (one thread per propertyId+contactId)
  let conversation = resolvedContactId
    ? await prisma.conversation.findUnique({
        where: { propertyId_contactId: { propertyId, contactId: resolvedContactId } },
      })
    : await prisma.conversation.findFirst({ where: { propertyId, contactId: null } })

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        propertyId,
        contactId: resolvedContactId,
        contactPhone: contactPhone ?? null,
        isRead: true,
        lastMessageAt: new Date(),
      },
    })
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), isRead: true },
    })
  }

  const message = await prisma.message.create({
    data: {
      propertyId,
      conversationId: conversation.id,
      contactId: resolvedContactId,
      leadCampaignId,
      channel,
      direction,
      body: messageBody,
      subject,
      sentById: userId,
    },
  })

  await Promise.all([
    prisma.activityLog.create({
      data: {
        propertyId,
        userId,
        action: 'MESSAGE_LOGGED',
        detail: { description: `${channel} ${direction === 'INBOUND' ? 'received' : 'logged'}` },
      },
    }),
    prisma.property.update({ where: { id: propertyId }, data: { lastActivityAt: new Date() } }),
  ])

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
