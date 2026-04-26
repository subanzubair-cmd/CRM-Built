import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import {
  Contact,
  PropertyContact,
  Property,
  TwilioNumber,
  LeadCampaign,
  Conversation,
  Message,
  ActiveCall,
  Op,
} from '@crm/database'

/**
 * POST /api/webhooks/twilio — UNIFIED Twilio webhook (SMS + Voice).
 *
 * Paste this URL in Twilio for BOTH:
 *   • Phone Numbers → Number → Messaging Webhook
 *   • Phone Numbers → Number → Voice Webhook
 *
 * The route sniffs the form-urlencoded payload and dispatches:
 *   • `MessageSid` + `Body`     → handleInboundSms()
 *   • `CallSid` + `CallStatus`  → handleCallEvent()
 *
 * Both flows write to the same unified Message + ActiveCall + Conversation
 * tables, so the CRM Inbox + Calls views display Twilio activity alongside
 * Telnyx without per-provider branches.
 */
export async function POST(req: NextRequest) {
  const text = await req.text()
  const params = Object.fromEntries(new URLSearchParams(text))

  // Signature verification (skip in dev when secrets aren't configured).
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const twimlHost = process.env.TWILIO_TWIML_HOST
  if (authToken && twimlHost) {
    const signature = req.headers.get('x-twilio-signature') ?? ''
    const fullUrl = `${twimlHost}/api/webhooks/twilio`
    const isValid = twilio.validateRequest(authToken, signature, fullUrl, params)
    if (!isValid) {
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  if (params.MessageSid && params.Body !== undefined) {
    return handleInboundSms(params)
  }
  if (params.CallSid) {
    return handleCallEvent(params)
  }

  console.warn('[webhook/twilio] unknown payload shape:', Object.keys(params))
  return NextResponse.json({ ok: true, ignored: 'unknown payload' })
}

// ─── Inbound SMS ──────────────────────────────────────────────────────

async function handleInboundSms(params: Record<string, string>) {
  const { From, To, Body, MessageSid } = params
  if (!From) {
    return NextResponse.json({ error: 'Missing From' }, { status: 400 })
  }

  try {
    const contactRow = await Contact.findOne({
      where: { [Op.or]: [{ phone: From }, { phone2: From }] },
      include: [
        {
          model: PropertyContact,
          as: 'properties',
          where: { isPrimary: true },
          required: false,
          separate: true,
          limit: 1,
          order: [['createdAt', 'DESC']],
          include: [{ model: Property, as: 'property', attributes: ['id'] }],
        },
      ],
    })
    const contact = contactRow?.get({ plain: true }) as any
    const propertyId = contact?.properties?.[0]?.property?.id ?? null
    const contactId = contact?.id ?? null

    let leadCampaignId: string | null = null
    if (To) {
      const tn = await TwilioNumber.findOne({ where: { number: To }, attributes: ['id'] })
      if (tn) {
        const lc = await LeadCampaign.findOne({
          where: { phoneNumberId: tn.id },
          attributes: ['id'],
          raw: true,
        }) as any
        leadCampaignId = lc?.id ?? null
      }
    }

    let conversation: any = null
    if (propertyId) {
      const where = contactId ? { propertyId, contactId } : { propertyId, contactId: null }
      conversation = await Conversation.findOne({ where })
      if (!conversation) {
        conversation = await Conversation.create({
          propertyId,
          contactId,
          contactPhone: From,
          isRead: false,
          lastMessageAt: new Date(),
        } as any)
      } else {
        await conversation.update({ isRead: false, lastMessageAt: new Date() })
      }
    }

    await Message.create({
      ...(propertyId ? { propertyId } : {}),
      ...(conversation?.id ? { conversationId: conversation.id } : {}),
      ...(contactId ? { contactId } : {}),
      ...(leadCampaignId ? { leadCampaignId } : {}),
      channel: 'SMS',
      direction: 'INBOUND',
      body: Body,
      from: From,
      to: To,
      twilioSid: MessageSid,
    } as any)

    return new NextResponse('<Response/>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (err) {
    console.error('[webhook/twilio sms]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Call status / inbound-call ───────────────────────────────────────

async function handleCallEvent(params: Record<string, string>) {
  const { CallSid, CallStatus, ConferenceSid, From, To, Direction } = params

  try {
    // INBOUND call ringing — create the ActiveCall row if it doesn't exist
    if (CallStatus === 'ringing' && Direction === 'inbound' && From && To) {
      const existing = await ActiveCall.findOne({
        where: { customerCallSid: CallSid },
      }).catch(() => null)
      if (!existing) {
        let leadCampaignId: string | null = null
        let propertyId: string | null = null
        const tn = await TwilioNumber.findOne({ where: { number: To }, attributes: ['id'] })
        if (tn) {
          const lc = await LeadCampaign.findOne({
            where: { phoneNumberId: tn.id },
            attributes: ['id'],
            raw: true,
          }) as any
          leadCampaignId = lc?.id ?? null
        }
        const contactRow = await Contact.findOne({
          where: { [Op.or]: [{ phone: From }, { phone2: From }] },
          include: [
            {
              model: PropertyContact,
              as: 'properties',
              where: { isPrimary: true },
              required: false,
              separate: true,
              limit: 1,
              order: [['createdAt', 'DESC']],
              include: [{ model: Property, as: 'property', attributes: ['id'] }],
            },
          ],
        })
        const cp = contactRow?.get({ plain: true }) as any
        propertyId = cp?.properties?.[0]?.property?.id ?? null

        await ActiveCall.create({
          conferenceName: CallSid,
          customerCallSid: CallSid,
          customerPhone: From,
          direction: 'INBOUND',
          status: 'RINGING',
          ...(propertyId ? { propertyId } : {}),
          ...(leadCampaignId ? { leadCampaignId } : {}),
        } as any)
      }
      return NextResponse.json({ ok: true })
    }

    // Status update on an existing ActiveCall (outbound or already-tracked inbound)
    const activeCall = await ActiveCall.findOne({
      where: {
        [Op.or]: [
          { agentCallSid: CallSid },
          { customerCallSid: CallSid },
          { supervisorCallSid: CallSid },
          { conferenceName: CallSid },
        ],
      },
    })
    if (!activeCall) {
      return NextResponse.json({ ok: true })
    }
    const call = activeCall.get({ plain: true }) as any

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (ConferenceSid && !call.conferenceId) updates.conferenceId = ConferenceSid
    if (CallStatus === 'ringing' && call.status === 'INITIATING') updates.status = 'RINGING'
    if (CallStatus === 'in-progress' && call.status !== 'ACTIVE') updates.status = 'ACTIVE'
    if (CallStatus === 'completed' && CallSid === call.agentCallSid) {
      updates.status = 'COMPLETED'
      updates.endedAt = new Date()
    }

    await activeCall.update(updates)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook/twilio call]', err)
    return NextResponse.json({ ok: true, error: 'logged' })
  }
}
