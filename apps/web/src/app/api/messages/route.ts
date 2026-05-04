import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import {
  ActiveCall,
  Contact,
  PropertyContact,
  Property,
  LeadCampaign,
  TwilioNumber,
  Conversation,
  Message,
  ActivityLog,
  Op,
  sequelize,
} from '@crm/database'
import { z } from 'zod'
import { emitEvent, DomainEvents } from '@/lib/domain-events'
import { sendSms } from '@/lib/sms-send'
import { getActiveCommConfig } from '@/lib/comm-provider'
import { mirrorCommunicationToRelatedLeads } from '@/lib/activity-mirror'

/**
 * Schema accepts both "log only" payloads (channel=NOTE, channel=CALL
 * with a disposition body) and "send" payloads (channel=SMS,
 * direction=OUTBOUND). For OUTBOUND SMS we actually call the comm
 * provider's send endpoint here — the previous version of this route
 * was a logging-only stub which silently wrote SMS rows to the DB
 * without ever dispatching them, so users saw outbound messages in the
 * activity feed but the recipient never got anything.
 */
const LogMessageSchema = z.object({
  propertyId: z.string().min(1),
  channel: z.enum(['CALL', 'NOTE', 'EMAIL', 'SMS']),
  body: z.string().min(1).max(10000),
  subject: z.string().optional(),
  direction: z.enum(['INBOUND', 'OUTBOUND']).default('OUTBOUND'),
  contactId: z.string().optional(),
  contactPhone: z.string().optional(),
  /** Optional explicit recipient phone/email. Used by SMS send + the
   *  activity feed's From/To meta line. */
  to: z.string().optional(),
  /** Optional explicit sender phone/email. When omitted for SMS we
   *  fall back through the property → campaign → comm-config chain. */
  from: z.string().optional(),
  /** Optional ISO timestamp. Today this is accepted but only logged
   *  — scheduled send is wired by the BullMQ scheduler in a separate
   *  pass. */
  scheduledAt: z.string().optional(),
  timezone: z.string().optional(),
  /** Optional ActiveCall.id link for CALL messages — lets the activity
   *  feed render an inline recording player + cost without re-querying. */
  activeCallId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.send')
  if (deny) return deny
  const userId = ((session as any)?.user?.id ?? '') as string

  const body = await req.json()
  const parsed = LogMessageSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const {
    propertyId,
    channel,
    body: messageBody,
    subject,
    direction,
    contactId,
    contactPhone,
    to: payloadTo,
    from: payloadFrom,
    scheduledAt,
    activeCallId,
  } = parsed.data

  // Resolve contactId if not passed: prefer primary contact, fall back
  // to contact matching phone.
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
  const property = (await Property.findByPk(propertyId, {
    attributes: ['leadCampaignId', 'defaultOutboundNumber'],
    include: [
      {
        model: LeadCampaign,
        as: 'leadCampaign',
        attributes: ['id'],
        include: [{ model: TwilioNumber, as: 'phoneNumber', attributes: ['number'] }],
      },
    ],
  })) as any
  const leadCampaignId = property?.leadCampaignId ?? null

  // Per-contact Conversation (one thread per propertyId+contactId).
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

  // For CALL messages, derive `from` / `to` from the linked ActiveCall
  // so the activity feed always shows both sides — the disposition
  // modal doesn't pass them and the conversation flow doesn't expose
  // the agent's number directly.
  //
  //   activeCallId provided → look up by id (fast, exact)
  //   activeCallId missing  → fall back to the most recent ActiveCall
  //                            for this property in the last 30 minutes.
  //                            Older flows (and some bulk-log paths)
  //                            don't pass activeCallId, and without
  //                            this fallback the activity row would
  //                            show no From/To at all.
  let callFrom: string | null = null
  let callTo: string | null = null
  if (channel === 'CALL') {
    let call: { customerPhone: string | null; crmNumber: string | null; direction: string } | null = null
    if (activeCallId) {
      call = (await ActiveCall.findByPk(activeCallId, {
        attributes: ['customerPhone', 'crmNumber', 'direction'],
        raw: true,
      })) as any
    } else {
      // Look for a recent call on this property — bias toward the
      // direction the message was logged with so an outbound
      // disposition doesn't accidentally pick up a stray inbound.
      const recentCall = (await ActiveCall.findOne({
        where: {
          propertyId,
          direction,
          createdAt: { [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) },
        },
        order: [['createdAt', 'DESC']],
        attributes: ['customerPhone', 'crmNumber', 'direction'],
        raw: true,
      })) as any
      if (recentCall) call = recentCall
    }
    if (call) {
      const isInbound = call.direction === 'INBOUND'
      callFrom = isInbound ? call.customerPhone : call.crmNumber
      callTo = isInbound ? call.crmNumber : call.customerPhone
    }
  }

  // ─── Outbound SMS: actually dispatch via the active comm provider ──
  //
  // Resolve the sender (`fromNumber`) using the same fallback chain as
  // /api/calls/start: explicit payload → property default → campaign
  // number → comm-config default. If everything is empty we refuse to
  // send rather than letting Telnyx 422 us — surface a clearer error.
  let smsFrom: string | null = null
  let smsTo: string | null = null
  let providerMessageId: string | null = null
  if (channel === 'SMS' && direction === 'OUTBOUND' && !scheduledAt) {
    const recipient = payloadTo ?? contactPhone
    if (!recipient) {
      return NextResponse.json(
        { error: 'Recipient phone (to) is required for SMS.' },
        { status: 422 },
      )
    }
    const commDefault = (await getActiveCommConfig())?.defaultNumber ?? null
    const resolvedFrom =
      payloadFrom ||
      property?.defaultOutboundNumber ||
      property?.leadCampaign?.phoneNumber?.number ||
      commDefault ||
      ''
    if (!resolvedFrom) {
      return NextResponse.json(
        {
          error:
            'No outbound sender configured. Set a Default Outbound Number in Settings → SMS & Phone Number Integration, or attach a phone number to this lead’s campaign.',
        },
        { status: 422 },
      )
    }

    try {
      const result = await sendSms({ from: resolvedFrom, to: recipient, text: messageBody })
      providerMessageId = result.providerMessageId
      smsFrom = resolvedFrom
      smsTo = recipient
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'SMS send failed'
      console.error('[messages] outbound SMS dispatch failed:', detail)
      return NextResponse.json({ error: detail }, { status: 502 })
    }
  } else if (channel === 'SMS' && direction === 'OUTBOUND' && scheduledAt) {
    // Scheduled SMS isn't wired yet (BullMQ worker pickup is a
    // separate task). Refuse the request rather than silently
    // persisting a Message that looks "sent" in the activity feed
    // but never reaches the recipient — that's worse UX than a
    // visible error.
    return NextResponse.json(
      {
        error:
          'Scheduled SMS is not yet enabled in this build. Please send immediately, or contact engineering to enable scheduled dispatch.',
      },
      { status: 422 },
    )
  } else if (channel === 'SMS' && direction === 'INBOUND') {
    // Inbound webhook path — preserve whatever from/to the caller supplied.
    smsFrom = payloadFrom ?? null
    smsTo = payloadTo ?? null
  }

  // For EMAIL we just persist whatever was passed; the email sender
  // pipeline lives elsewhere (and is a no-op today in dev).
  const emailFrom = channel === 'EMAIL' ? payloadFrom ?? null : null
  const emailTo = channel === 'EMAIL' ? payloadTo ?? null : null

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
        ...(callFrom || smsFrom || emailFrom ? { from: callFrom ?? smsFrom ?? emailFrom } : {}),
        ...(callTo || smsTo || emailTo ? { to: callTo ?? smsTo ?? emailTo } : {}),
        // Stash the provider id in twilioSid for cross-provider continuity.
        // For CALL messages this is the ActiveCall.id; for outbound SMS
        // it's the Telnyx message uuid; for inbound SMS the Telnyx webhook
        // writes the same column.
        ...(channel === 'CALL' && activeCallId ? { twilioSid: activeCallId } : {}),
        ...(channel === 'SMS' && providerMessageId ? { twilioSid: providerMessageId } : {}),
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

  // Mirror the communication to other leads sharing the same phone/email.
  // Fire-and-forget — mirrors must never delay or block the response.
  //
  // The mirror key is the COUNTERPARTY's identifier (the customer's phone
  // / email), not our own CRM number. Which side that is depends on
  // direction:
  //   OUTBOUND → counterparty is the recipient (to)
  //   INBOUND  → counterparty is the sender (from)
  // The earlier `smsTo ?? smsFrom` / `callFrom ?? callTo` shortcut was
  // direction-blind and broke for outbound calls — `callFrom` is the
  // agent's CRM number on outbound, so findLeadsForPhone resolved to
  // zero matches and the mirror silently no-op'd.
  const customerPhone =
    channel === 'SMS'
      ? direction === 'OUTBOUND'
        ? smsTo
        : smsFrom
      : channel === 'CALL'
        ? direction === 'OUTBOUND'
          ? callTo
          : callFrom
        : null
  const mirrorPhone = customerPhone ?? null
  const mirrorEmail =
    channel === 'EMAIL'
      ? direction === 'OUTBOUND'
        ? emailTo
        : emailFrom
      : null

  if (mirrorPhone || mirrorEmail) {
    // Pass `message` for SMS/CALL so related leads ALSO receive a real
    // Conversation + Message row (visible in their Comm & Notes feed),
    // matching the inbound SMS webhook fan-out pattern. NOTE/EMAIL still
    // get ActivityLog-only mirroring (omit `message`).
    const mirrorMessage =
      channel === 'SMS' || channel === 'CALL'
        ? {
            channel: channel as 'SMS' | 'CALL',
            direction: direction as 'INBOUND' | 'OUTBOUND',
            body: messageBody ?? null,
            from: callFrom ?? smsFrom ?? null,
            to: callTo ?? smsTo ?? null,
            twilioSid:
              channel === 'CALL' && activeCallId
                ? activeCallId
                : channel === 'SMS' && providerMessageId
                  ? providerMessageId
                  : null,
          }
        : null

    void mirrorCommunicationToRelatedLeads({
      originPropertyId: propertyId,
      phone: mirrorPhone,
      email: mirrorEmail,
      action: 'MESSAGE_LOGGED',
      detail: {
        description: `${channel} ${direction === 'INBOUND' ? 'received' : 'sent'}`,
        channel,
        direction,
        ...(mirrorPhone ? { phone: mirrorPhone } : {}),
        ...(mirrorEmail ? { email: mirrorEmail } : {}),
      },
      userId,
      actorType: 'user',
      message: mirrorMessage,
    })
  }

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
