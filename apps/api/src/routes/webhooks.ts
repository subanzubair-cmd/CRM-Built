import { Router, type Request, type Response } from 'express'
import {
  Contact,
  PropertyContact,
  Property,
  TwilioNumber,
  LeadCampaign,
  Conversation,
  Message,
  WebhookEvent,
  Op,
} from '@crm/database'
import { validateWebhookSignature } from '../lib/twilio.js'
import { automationQueue } from '../queues/index.js'

const router = Router()

router.post('/twilio', async (req: Request, res: Response) => {
  const signature = req.headers['x-twilio-signature'] as string ?? ''
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`
  const params = req.body as Record<string, string>

  if (!validateWebhookSignature(url, params, signature)) {
    res.status(403).json({ error: 'Invalid signature' })
    return
  }

  const { From, To, Body, MessageSid } = params
  if (!From || !Body) {
    res.status(400).json({ error: 'Missing From or Body' })
    return
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
      const where = contactId
        ? { propertyId, contactId }
        : { propertyId, contactId: null }
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

    const message = await Message.create({
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

    if (propertyId) {
      await automationQueue.add('automation', {
        trigger: 'MANUAL',
        propertyId,
        meta: { source: 'inbound_sms', from: From, leadCampaignId },
      })
    }

    console.log(
      `[webhook/twilio] inbound SMS from ${From} (contact=${contactId}, property=${propertyId}, campaign=${leadCampaignId}), message ${message.id}`,
    )

    res.status(200).set('Content-Type', 'text/xml').send('<Response/>')
  } catch (err) {
    console.error('[webhook/twilio] error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:source', async (req: Request, res: Response) => {
  const { source } = req.params
  try {
    await WebhookEvent.create({
      source,
      payload: req.body,
      status: 'PENDING',
    } as any).catch(() => {
      console.log(`[webhook/${source}] received (no WebhookEvent model)`)
    })

    res.status(200).json({ received: true })
  } catch (err) {
    console.error(`[webhook/${source}] error:`, err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
