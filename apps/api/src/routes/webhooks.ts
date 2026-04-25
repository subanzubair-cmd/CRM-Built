/**
 * Inbound webhook handlers
 *
 * POST /api/webhooks/twilio  — Inbound SMS from Twilio
 * POST /api/webhooks/:source — Generic webhook gateway (Phase 18 expands this)
 */

import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { TwilioNumber } from '@crm/database'
import { validateWebhookSignature } from '../lib/twilio.js'
import { automationQueue } from '../queues/index.js'

const router = Router()

// ── Twilio inbound SMS webhook ─────────────────────────────────────────────────
router.post('/twilio', async (req: Request, res: Response) => {
  // Validate signature (skipped in dev if credentials are missing)
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
    // 1. Resolve the sender's Contact (for per-contact threading)
    const contact = await prisma.contact.findFirst({
      where: { OR: [{ phone: From }, { phone2: From }] },
      include: {
        properties: {
          where: { isPrimary: true },
          include: { property: { select: { id: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    const propertyId = contact?.properties[0]?.property.id ?? null
    const contactId = contact?.id ?? null

    // 2. Resolve the LeadCampaign that owns the inbound number (for attribution).
    //    TwilioNumber moved to Sequelize in Phase 2; LeadCampaign is still
    //    on Prisma until Phase 4 — split into two queries to avoid a
    //    cross-ORM `include`.
    let leadCampaignId: string | null = null
    if (To) {
      const tn = await TwilioNumber.findOne({ where: { number: To }, attributes: ['id'] })
      if (tn) {
        const lc = await prisma.leadCampaign.findFirst({
          where: { phoneNumberId: tn.id },
          select: { id: true },
        })
        leadCampaignId = lc?.id ?? null
      }
    }

    // 3. Per-contact Conversation: unique on (propertyId, contactId)
    let conversation = null
    if (propertyId) {
      conversation = contactId
        ? await prisma.conversation.findUnique({
            where: { propertyId_contactId: { propertyId, contactId } },
          })
        : await prisma.conversation.findFirst({
            where: { propertyId, contactId: null },
          })

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            propertyId,
            contactId,
            contactPhone: From,
            isRead: false,
            lastMessageAt: new Date(),
          },
        })
      } else {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { isRead: false, lastMessageAt: new Date() },
        })
      }
    }

    // 4. Create the inbound Message record with full attribution
    const message = await prisma.message.create({
      data: {
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
      } as any,
    })

    // 5. Enqueue automation (MANUAL trigger for now; downstream can listen)
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

// ── Generic webhook gateway ────────────────────────────────────────────────────
router.post('/:source', async (req: Request, res: Response) => {
  const { source } = req.params
  try {
    // Log all incoming webhooks for auditing
    await (prisma as any).webhookEvent?.create({
      data: {
        source,
        payload: req.body,
        status: 'PENDING',
      },
    }).catch(() => {
      // WebhookEvent model may not exist — log and continue
      console.log(`[webhook/${source}] received (no WebhookEvent model)`)
    })

    res.status(200).json({ received: true })
  } catch (err) {
    console.error(`[webhook/${source}] error:`, err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
