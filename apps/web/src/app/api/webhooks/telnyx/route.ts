import { NextRequest, NextResponse } from 'next/server'
import { createPublicKey, verify as cryptoVerify } from 'node:crypto'
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
import { getActiveCommConfig } from '@/lib/comm-provider'

/**
 * POST /api/webhooks/telnyx — UNIFIED Telnyx webhook (SMS + Voice).
 *
 * Paste this URL in Telnyx for BOTH:
 *   • Messaging → Messaging Profiles → <profile> → Inbound Webhook URL
 *   • Voice → Voice API & Apps → <app> → Webhook URL
 *
 * Dispatches on `data.event_type`:
 *   • `message.received`                              → SMS path
 *   • `call.initiated/answered/bridged/hangup`        → Voice path
 *
 * Both paths write to the same Message + ActiveCall + Conversation tables
 * the Twilio webhook uses, so the CRM Inbox + Calls views are fully
 * provider-agnostic — Telnyx and Twilio activity sit side-by-side.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const config = await getActiveCommConfig()
  const sigHeader = req.headers.get('telnyx-signature-ed25519')
  const tsHeader = req.headers.get('telnyx-timestamp')

  // Signature verification — only enforced when Public Key is configured.
  if (config?.providerName === 'telnyx' && config.publicKey) {
    if (!sigHeader || !tsHeader) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }
    const ts = Number(tsHeader)
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      return NextResponse.json({ error: 'Stale timestamp' }, { status: 401 })
    }
    try {
      const signedPayload = Buffer.from(`${tsHeader}|${rawBody}`, 'utf8')
      const signature = Buffer.from(sigHeader, 'base64')
      const pubKey = createPublicKey({
        key: Buffer.from(config.publicKey, 'base64'),
        format: 'der',
        type: 'spki',
      })
      const ok = cryptoVerify(null, signedPayload, pubKey, signature)
      if (!ok) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
      }
    } catch (err) {
      console.error('[webhook/telnyx] signature verify failed:', err)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = body?.data?.event_type as string | undefined
  const payload = body?.data?.payload

  if (!eventType) {
    return NextResponse.json({ ok: true, ignored: 'no event_type' })
  }
  if (eventType.startsWith('message.')) {
    return handleSmsEvent(eventType, payload)
  }
  if (eventType.startsWith('call.')) {
    return handleCallEvent(eventType, payload)
  }
  return NextResponse.json({ ok: true, ignored: eventType })
}

// ─── SMS events ────────────────────────────────────────────────────────

async function handleSmsEvent(eventType: string, payload: any) {
  if (eventType !== 'message.received') {
    return NextResponse.json({ ok: true, ignored: eventType })
  }

  const fromPhone = payload?.from?.phone_number as string | undefined
  const toPhone = (Array.isArray(payload?.to) ? payload.to[0]?.phone_number : undefined) as string | undefined
  const text = (payload?.text ?? '') as string
  const telnyxId = payload?.id as string | undefined

  if (!fromPhone || !text) {
    return NextResponse.json({ error: 'Missing from or text' }, { status: 400 })
  }

  try {
    const contactRow = await Contact.findOne({
      where: { [Op.or]: [{ phone: fromPhone }, { phone2: fromPhone }] },
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
    if (toPhone) {
      const tn = await TwilioNumber.findOne({ where: { number: toPhone }, attributes: ['id'] })
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
          contactPhone: fromPhone,
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
      body: text,
      from: fromPhone,
      to: toPhone,
      twilioSid: telnyxId,
    } as any)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook/telnyx sms]', err)
    return NextResponse.json({ ok: true, error: 'logged' })
  }
}

// ─── Call events ───────────────────────────────────────────────────────

/**
 * Pull cost off the hangup payload. Telnyx ships it in one of these shapes
 * depending on the Voice API Application config:
 *   payload.cost = "0.0040"   + payload.cost_currency = "USD"
 *   payload.cost = { amount: "0.0040", currency: "USD" }
 *   payload.billing.cost      + payload.billing.currency
 * Returns null if cost wasn't pushed inline (CDR fetch fallback handles that).
 */
function extractCost(payload: any): { amount: number; currency: string | null } | null {
  if (!payload) return null
  const direct = payload.cost
  if (typeof direct === 'object' && direct !== null && direct.amount !== undefined) {
    const n = Number(direct.amount)
    if (Number.isFinite(n)) return { amount: n, currency: direct.currency ?? payload.cost_currency ?? null }
  }
  if (direct !== undefined && direct !== null && typeof direct !== 'object') {
    const n = Number(direct)
    if (Number.isFinite(n)) return { amount: n, currency: payload.cost_currency ?? null }
  }
  if (payload.billing?.cost !== undefined) {
    const n = Number(payload.billing.cost)
    if (Number.isFinite(n)) return { amount: n, currency: payload.billing.currency ?? null }
  }
  return null
}

/**
 * Background fetch of the per-call cost from Telnyx's CDR endpoint.
 * Cost isn't always present on the hangup webhook — it lands in the CDR a
 * few seconds after hangup. We delay 8s and then update ActiveCall.
 * Fire-and-forget; failure is logged and ignored.
 */
function scheduleCdrCostFetch(callControlId: string, apiKey: string): void {
  const DELAY_MS = 8_000
  setTimeout(async () => {
    try {
      const res = await fetch(
        `https://api.telnyx.com/v2/calls/${encodeURIComponent(callControlId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      )
      if (!res.ok) return
      const json = (await res.json()) as any
      const cost = extractCost(json?.data)
      if (!cost) return
      await ActiveCall.update(
        { cost: cost.amount, costCurrency: cost.currency ?? 'USD' } as any,
        { where: { conferenceName: callControlId } },
      )
    } catch (err) {
      console.warn('[webhook/telnyx] CDR cost fetch failed for', callControlId, err)
    }
  }, DELAY_MS)
}

async function handleCallEvent(eventType: string, payload: any) {
  const callControlId = payload?.call_control_id as string | undefined
  const direction = payload?.direction as 'incoming' | 'outgoing' | undefined
  const fromPhone = payload?.from as string | undefined
  const toPhone = payload?.to as string | undefined

  if (!callControlId) {
    return NextResponse.json({ ok: true, ignored: 'missing call_control_id' })
  }

  try {
    if (eventType === 'call.initiated' && direction === 'incoming' && fromPhone && toPhone) {
      const existing = await ActiveCall.findOne({
        where: { conferenceName: callControlId },
      }).catch(() => null)
      if (!existing) {
        let leadCampaignId: string | null = null
        let propertyId: string | null = null
        const tn = await TwilioNumber.findOne({ where: { number: toPhone }, attributes: ['id'] })
        if (tn) {
          const lc = await LeadCampaign.findOne({
            where: { phoneNumberId: tn.id },
            attributes: ['id'],
            raw: true,
          }) as any
          leadCampaignId = lc?.id ?? null
        }
        const contactRow = await Contact.findOne({
          where: { [Op.or]: [{ phone: fromPhone }, { phone2: fromPhone }] },
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
          conferenceName: callControlId,
          customerPhone: fromPhone,
          direction: 'INBOUND',
          status: 'RINGING',
          ...(propertyId ? { propertyId } : {}),
          ...(leadCampaignId ? { leadCampaignId } : {}),
        } as any)
      }
      return NextResponse.json({ ok: true })
    }

    const activeCall = await ActiveCall.findOne({
      where: {
        [Op.or]: [
          { conferenceName: callControlId },
          { agentCallSid: callControlId },
          { customerCallSid: callControlId },
        ],
      },
    })
    if (!activeCall) {
      return NextResponse.json({ ok: true, ignored: 'no matching ActiveCall' })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (eventType === 'call.answered') updates.status = 'ACTIVE'
    if (eventType === 'call.bridged' && payload?.call_session_id) {
      updates.conferenceId = payload.call_session_id
      updates.status = 'ACTIVE'
    }
    if (eventType === 'call.hangup') {
      updates.status = 'COMPLETED'
      updates.endedAt = new Date()

      // Capture cost when CommProviderConfig.enableCallCost is true.
      // Try inline payload first; if not present, schedule a CDR fetch.
      const config = await getActiveCommConfig()
      if (config?.providerName === 'telnyx' && config.enableCallCost) {
        const inlineCost = extractCost(payload)
        if (inlineCost) {
          updates.cost = inlineCost.amount
          updates.costCurrency = inlineCost.currency ?? 'USD'
        } else if (config.apiKey) {
          scheduleCdrCostFetch(callControlId, config.apiKey)
        }
      }
    }

    if (Object.keys(updates).length > 1) {
      await activeCall.update(updates)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook/telnyx call]', err)
    return NextResponse.json({ ok: true, error: 'logged' })
  }
}
