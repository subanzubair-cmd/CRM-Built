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
  ActivityLog,
  Op,
  sequelize,
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
    // Drop the isPrimary filter so a sender who's the secondary
    // contact on an existing lead is still treated as "known".
    const contactRow = await Contact.findOne({
      where: { [Op.or]: [{ phone: fromPhone }, { phone2: fromPhone }] },
      include: [
        {
          model: PropertyContact,
          as: 'properties',
          required: false,
          separate: true,
          limit: 1,
          order: [
            ['isPrimary', 'DESC'],
            ['createdAt', 'DESC'],
          ],
          include: [{ model: Property, as: 'property', attributes: ['id'] }],
        },
      ],
    })
    const contact = contactRow?.get({ plain: true }) as any
    let propertyId: string | null = contact?.properties?.[0]?.property?.id ?? null
    const existingContactId: string | null = contact?.id ?? null

    let leadCampaignId: string | null = null
    let leadCampaignType: string | null = null
    if (toPhone) {
      const tn = await TwilioNumber.findOne({ where: { number: toPhone }, attributes: ['id'] })
      if (tn) {
        const lc = await LeadCampaign.findOne({
          where: { phoneNumberId: tn.id },
          attributes: ['id', 'type'],
          raw: true,
        }) as any
        leadCampaignId = lc?.id ?? null
        leadCampaignType = lc?.type ?? null
      }
    }

    // Unknown sender + no existing lead → auto-create one under the
    // receiving number's campaign so the message lands in the inbox
    // attached to a real lead the agent can reply from.
    let createdContactId: string | null = null
    if (!propertyId && leadCampaignId) {
      const created = await autoCreateInboundLead({
        fromPhone,
        leadCampaignId,
        leadCampaignType,
        existingContactId,
      })
      propertyId = created
      // After auto-create, re-resolve the contactId so the
      // conversation links to the right Contact row (the helper
      // either created a fresh one or reused existingContactId).
      if (propertyId) {
        const pc = await PropertyContact.findOne({
          where: { propertyId, isPrimary: true },
          attributes: ['contactId'],
          raw: true,
        }) as any
        createdContactId = pc?.contactId ?? null
      }
    }

    const finalContactId = existingContactId ?? createdContactId

    let conversation: any = null
    if (propertyId) {
      const where = finalContactId
        ? { propertyId, contactId: finalContactId }
        : { propertyId, contactId: null }
      conversation = await Conversation.findOne({ where })
      if (!conversation) {
        conversation = await Conversation.create({
          propertyId,
          contactId: finalContactId,
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
      ...(finalContactId ? { contactId: finalContactId } : {}),
      ...(leadCampaignId ? { leadCampaignId } : {}),
      channel: 'SMS',
      direction: 'INBOUND',
      body: text,
      from: fromPhone,
      to: toPhone,
      twilioSid: telnyxId,
    } as any)

    // Activity log so the message appears in the lead's Activity tab
    // and the global /activity feed with From/To surfaced.
    if (propertyId) {
      try {
        await ActivityLog.create({
          propertyId,
          userId: null,
          action: 'MESSAGE_LOGGED',
          detail: {
            description: `SMS received: ${text.length > 80 ? text.slice(0, 80) + '…' : text}`,
            channel: 'SMS',
            direction: 'INBOUND',
            from: fromPhone,
            to: toPhone,
          },
        } as any)
      } catch (err) {
        console.warn('[webhook/telnyx sms] failed to log activity:', err)
      }
    }

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
        // 1) Resolve which CRM number was called → which campaign owns it.
        let leadCampaignId: string | null = null
        let leadCampaignType: string | null = null
        const tn = await TwilioNumber.findOne({ where: { number: toPhone }, attributes: ['id'] }) as any
        if (tn) {
          const lc = await LeadCampaign.findOne({
            where: { phoneNumberId: tn.id },
            attributes: ['id', 'type'],
            raw: true,
          }) as any
          leadCampaignId = lc?.id ?? null
          leadCampaignType = lc?.type ?? null
        }

        // 2) Look up the caller. If they're tied to ANY existing
        //    property — under any campaign — attribute the call there
        //    (no duplicate lead). Otherwise auto-create a lead under
        //    the dialed number's campaign so the agent has somewhere
        //    to log notes and the call doesn't vanish.
        //
        //    "Any" property means we drop the `isPrimary` filter on
        //    purpose: a caller who is the secondary contact on a
        //    flip is still an existing lead, not a new one.
        const contactRow = await Contact.findOne({
          where: { [Op.or]: [{ phone: fromPhone }, { phone2: fromPhone }] },
          include: [
            {
              model: PropertyContact,
              as: 'properties',
              required: false,
              separate: true,
              limit: 1,
              order: [
                ['isPrimary', 'DESC'],
                ['createdAt', 'DESC'],
              ],
              include: [{ model: Property, as: 'property', attributes: ['id'] }],
            },
          ],
        })
        const cp = contactRow?.get({ plain: true }) as any
        const existingContactId = cp?.id ?? null
        let propertyId = cp?.properties?.[0]?.property?.id ?? null

        if (!propertyId && leadCampaignId) {
          propertyId = await autoCreateInboundLead({
            fromPhone,
            leadCampaignId,
            leadCampaignType,
            existingContactId,
          })
        }

        await ActiveCall.create({
          conferenceName: callControlId,
          customerPhone: fromPhone,
          direction: 'INBOUND',
          status: 'RINGING',
          ...(propertyId ? { propertyId } : {}),
          ...(leadCampaignId ? { leadCampaignId } : {}),
        } as any)

        // 3) Tell Telnyx to ANSWER the call so the customer hears
        //    silence/hold instead of the call timing out at ~30s. The
        //    agent then picks up via the InboundCallNotification popup.
        const config = await getActiveCommConfig()
        if (config?.providerName === 'telnyx' && config.apiKey) {
          void fetch(
            `https://api.telnyx.com/v2/calls/${encodeURIComponent(callControlId)}/actions/answer`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({}),
            },
          ).catch((err) => console.warn('[webhook/telnyx] answer command failed:', err))
        }
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

      // Persist a Message row for the call so it shows up in the
      // comms thread + activity timeline alongside SMS/Email/Notes.
      // We do this on hangup (not initiated) so we have the duration
      // and outcome locked in.
      try {
        const startedAt = activeCall.startedAt ? new Date(activeCall.startedAt as any) : null
        const durationSec = startedAt ? Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000)) : null
        const wasAnswered = activeCall.status === 'ACTIVE'
        const minutes = durationSec ? Math.floor(durationSec / 60) : 0
        const seconds = durationSec ? durationSec % 60 : 0
        const durStr = durationSec ? `${minutes}:${seconds.toString().padStart(2, '0')}` : null
        const summary =
          activeCall.direction === 'INBOUND'
            ? wasAnswered
              ? `Inbound call · ${durStr ?? 'completed'}`
              : 'Inbound call · Not Answered'
            : wasAnswered
              ? `Outbound call · ${durStr ?? 'completed'}`
              : 'Outbound call · Not Answered'

        // Telnyx populates `from` + `to` consistently across directions:
        //   inbound  → from = caller, to = CRM number
        //   outbound → from = CRM number, to = customer
        // So we can pass the payload values straight through.
        const callFrom = fromPhone ?? (activeCall.direction === 'INBOUND' ? (activeCall.customerPhone as string | null) : null)
        const callTo = toPhone ?? (activeCall.direction === 'OUTBOUND' ? (activeCall.customerPhone as string | null) : null)

        await Message.create({
          ...(activeCall.propertyId ? { propertyId: activeCall.propertyId } : {}),
          ...(activeCall.leadCampaignId ? { leadCampaignId: activeCall.leadCampaignId } : {}),
          channel: 'CALL',
          direction: activeCall.direction === 'INBOUND' ? 'INBOUND' : 'OUTBOUND',
          body: summary,
          from: callFrom,
          to: callTo,
          twilioSid: callControlId,
        } as any)

        // Also drop an ActivityLog so the call shows up on the
        // Activity tab + global /activity feed with from/to surfaced.
        if (activeCall.propertyId) {
          try {
            await ActivityLog.create({
              propertyId: activeCall.propertyId,
              userId: null,
              action: 'MESSAGE_LOGGED',
              detail: {
                description: summary,
                channel: 'CALL',
                direction: activeCall.direction,
                from: callFrom,
                to: callTo,
                durationSec,
              },
            } as any)
          } catch (err) {
            console.warn('[webhook/telnyx] failed to log call activity:', err)
          }
        }
      } catch (err) {
        console.warn('[webhook/telnyx] failed to persist CALL Message row:', err)
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

/**
 * Auto-create a Lead (Property + Contact + PropertyContact) for an
 * inbound call. Caller's phone is NOT already on any property — the
 * lookup in handleCallEvent already verified that.
 *
 * Wired off the Lead Campaign that owns the dialed number — leadType +
 * contact type follow campaign type (DTA → AGENT, anything else →
 * SELLER as default).
 *
 * Reuses an existing Contact (matched on phone) when the caller is in
 * our Contacts table but had no Property attached — common for cold
 * imports. Only inserts a fresh Contact when one doesn't exist.
 *
 * Address fields are blank — the agent fills them in during/after the
 * call. Lead is marked NEW_LEAD with source = "Inbound Call" so it
 * shows up in the active pipeline immediately.
 *
 * Returns the new Property.id, or null on failure (the call still
 * lands in the inbox; just without a Property attribution).
 */
async function autoCreateInboundLead(args: {
  fromPhone: string
  leadCampaignId: string
  leadCampaignType: string | null
  existingContactId: string | null
}): Promise<string | null> {
  const { fromPhone, leadCampaignId, leadCampaignType, existingContactId } = args

  const isDta = leadCampaignType === 'DTA'
  const leadType = isDta ? 'DIRECT_TO_AGENT' : 'DIRECT_TO_SELLER'
  const contactType = isDta ? 'AGENT' : 'SELLER'

  try {
    const result = await sequelize.transaction(async (tx) => {
      const property = await Property.create(
        {
          leadType,
          leadStatus: 'ACTIVE',
          propertyStatus: 'LEAD',
          activeLeadStage: 'NEW_LEAD',
          source: 'Inbound Call',
          leadCampaignId,
        } as any,
        { transaction: tx },
      )

      let contactId = existingContactId
      if (!contactId) {
        const contact = await Contact.create(
          {
            firstName: 'Unknown',
            lastName: 'Caller',
            phone: fromPhone,
            type: contactType,
          } as any,
          { transaction: tx },
        )
        contactId = contact.id
      }

      await PropertyContact.create(
        {
          propertyId: property.id,
          contactId,
          isPrimary: true,
        } as any,
        { transaction: tx },
      )

      return property.id
    })
    console.log(
      '[webhook/telnyx] auto-created inbound lead',
      result,
      'from',
      fromPhone,
      existingContactId ? '(reused contact)' : '(new contact)',
    )
    return result
  } catch (err) {
    console.error('[webhook/telnyx] autoCreateInboundLead failed:', err)
    return null
  }
}
