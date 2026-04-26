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
import { recordHit, classifySource, snapshotHeaders } from '@/lib/webhook-log'

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
  const userAgent = req.headers.get('user-agent')
  const source = classifySource(userAgent)
  const headers = snapshotHeaders(req)

  // Dev-only signature bypass. Production hard-blocks this regardless
  // of env var so a leaked .env.production never silently disables
  // verification. Logs a loud warning every time it's hit.
  const skipEnv = (process.env.TELNYX_SKIP_SIGNATURE_VERIFICATION ?? '').toLowerCase()
  const inProd = process.env.NODE_ENV === 'production'
  const bypassSignature = !inProd && (skipEnv === 'true' || skipEnv === '1')
  if (bypassSignature) {
    console.warn(
      '[webhook/telnyx] ⚠️  SIGNATURE VERIFICATION BYPASSED via TELNYX_SKIP_SIGNATURE_VERIFICATION=true (dev-mode only).',
    )
  }

  // Tiny helper so we record the hit + return in one shot. Body-parse
  // is deferred until after signature verification so the diagnostic
  // can show "401 invalid signature" with from/to phone null.
  function done(status: number, outcome: string, extra?: { eventType?: string | null; fromPhone?: string | null; toPhone?: string | null }, payload?: any): NextResponse {
    recordHit({
      ts: Date.now(),
      route: 'telnyx',
      hasSignature: !!sigHeader,
      eventType: extra?.eventType ?? null,
      responseStatus: status,
      outcome,
      fromPhone: extra?.fromPhone ?? null,
      toPhone: extra?.toPhone ?? null,
      userAgent,
      source,
      headers,
    })
    return NextResponse.json(payload ?? { ok: status < 300 }, { status })
  }

  // Signature verification — enforced when Public Key is set AND we're
  // not in dev-bypass mode. Telnyx retries 4xx responses for ~24h, so
  // we still return quickly on rejection (no slow handshake).
  if (config?.providerName === 'telnyx' && config.publicKey && !bypassSignature) {
    if (!sigHeader || !tsHeader) {
      return done(401, 'signature missing', {}, { error: 'Missing signature' })
    }
    const ts = Number(tsHeader)
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      return done(401, 'signature stale-timestamp', {}, { error: 'Stale timestamp' })
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
        return done(403, 'signature invalid (key mismatch?)', {}, { error: 'Invalid signature' })
      }
    } catch (err) {
      console.error('[webhook/telnyx] signature verify failed:', err)
      return done(403, 'signature crypto error', {}, { error: 'Invalid signature' })
    }
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return done(400, 'invalid JSON', {}, { error: 'Invalid JSON' })
  }

  const eventType = body?.data?.event_type as string | undefined
  const payload = body?.data?.payload
  const extractFrom: string | null =
    payload?.from?.phone_number ?? (typeof payload?.from === 'string' ? payload.from : null)
  const extractTo: string | null =
    (Array.isArray(payload?.to) ? payload.to[0]?.phone_number : null) ??
    (typeof payload?.to === 'string' ? payload.to : null)

  if (!eventType) {
    return done(200, 'ignored — no event_type', { eventType: null }, { ok: true, ignored: 'no event_type' })
  }
  if (eventType.startsWith('message.')) {
    const res = await handleSmsEvent(eventType, payload)
    recordHit({
      ts: Date.now(),
      route: 'telnyx',
      hasSignature: !!sigHeader,
      eventType,
      responseStatus: res.status,
      outcome: bypassSignature ? 'sms handled (sig bypassed)' : 'sms handled',
      fromPhone: extractFrom,
      toPhone: extractTo,
      userAgent,
      source,
      headers,
    })
    return res
  }
  if (eventType.startsWith('call.')) {
    const res = await handleCallEvent(eventType, payload)
    recordHit({
      ts: Date.now(),
      route: 'telnyx',
      hasSignature: !!sigHeader,
      eventType,
      responseStatus: res.status,
      outcome: bypassSignature ? 'call handled (sig bypassed)' : 'call handled',
      fromPhone: extractFrom,
      toPhone: extractTo,
      userAgent,
      source,
      headers,
    })
    return res
  }
  return done(200, `ignored — ${eventType}`, { eventType, fromPhone: extractFrom, toPhone: extractTo }, { ok: true, ignored: eventType })
}

/**
 * Resolve { leadCampaignId, leadCampaignType } for a dialed/sent-to
 * phone number. Tolerates whatever format TwilioNumber.number is
 * stored in: +E.164, bare E.164, last-10, with/without parens. We
 * try the most-specific format first then fall back through
 * progressively more permissive variants.
 *
 * Without this, Telnyx's `+14694850786` failed to match a TwilioNumber
 * row stored as `14694850786` (or vice versa) and the webhook silently
 * dropped the campaign attribution → no lead got auto-created.
 */
async function resolveCampaignByPhone(
  rawPhone: string | undefined,
): Promise<{ leadCampaignId: string | null; leadCampaignType: string | null }> {
  if (!rawPhone) return { leadCampaignId: null, leadCampaignType: null }

  // Build candidate formats from most-specific to fallback.
  const trimmed = rawPhone.trim()
  const digits = trimmed.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  const candidates = Array.from(
    new Set(
      [
        trimmed,                // exact original e.g. +14694850786
        digits,                 // 14694850786
        last10,                 // 4694850786
        `+${digits}`,           // +14694850786 (re-add + if input had no +)
        `+1${last10}`,          // +14694850786 (US prefix re-added)
        `1${last10}`,           // 14694850786
      ].filter(Boolean),
    ),
  )

  for (const candidate of candidates) {
    const tn = await TwilioNumber.findOne({ where: { number: candidate }, attributes: ['id'] }) as any
    if (!tn) continue
    const lc = await LeadCampaign.findOne({
      where: { phoneNumberId: tn.id },
      attributes: ['id', 'type'],
      raw: true,
    }) as any
    console.log(
      `[webhook/telnyx] resolveCampaignByPhone: matched TwilioNumber ${tn.id} via "${candidate}" → leadCampaign=${lc?.id ?? '(none)'}`,
    )
    return { leadCampaignId: lc?.id ?? null, leadCampaignType: lc?.type ?? null }
  }

  console.warn(
    `[webhook/telnyx] resolveCampaignByPhone: no TwilioNumber matched any of [${candidates.join(', ')}] for raw phone "${rawPhone}". Lead will be auto-created without campaign attribution.`,
  )
  return { leadCampaignId: null, leadCampaignType: null }
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
    // Find ALL leads attached to this phone number — a single phone
    // may legitimately appear on multiple Contacts (data import dupes)
    // or on multiple Properties (one Contact, many leads), and the
    // operator wants the inbound message to land on every one of them.
    const matches = await findAllLeadsForPhone(fromPhone)
    console.log(
      `[webhook/telnyx sms] inbound from=${fromPhone} to=${toPhone} → ${matches.length} existing lead match(es)`,
    )

    const { leadCampaignId, leadCampaignType } = await resolveCampaignByPhone(toPhone)

    // Unknown sender + a campaign owns the receiving number → create
    // a lead under THAT campaign. If the receiving number isn't tied
    // to any campaign, we don't auto-create (no campaign attribution
    // = no pipeline placement); the message still gets logged
    // unattributed below so it's not silently dropped.
    if (matches.length === 0 && leadCampaignId) {
      const created = await autoCreateInboundLead({
        fromPhone,
        leadCampaignId,
        leadCampaignType,
        existingContactId: null,
      })
      if (created) {
        const pc = await PropertyContact.findOne({
          where: { propertyId: created, isPrimary: true },
          attributes: ['contactId'],
          raw: true,
        }) as any
        matches.push({ propertyId: created, contactId: pc?.contactId ?? null })
        console.log(`[webhook/telnyx sms] auto-created lead ${created} for ${fromPhone} under campaign ${leadCampaignId}`)
      } else {
        console.error(`[webhook/telnyx sms] autoCreateInboundLead returned null for ${fromPhone}`)
      }
    } else if (matches.length === 0 && !leadCampaignId) {
      console.warn(
        `[webhook/telnyx sms] no campaign owns dialed number ${toPhone} — skipping auto-create. Assign this number to a Lead Campaign to enable auto-lead creation.`,
      )
    }

    // Fan out: write Message + Conversation + ActivityLog per matched
    // lead so each one surfaces the inbound SMS independently.
    for (const m of matches) {
      await persistInboundSms({
        propertyId: m.propertyId,
        contactId: m.contactId,
        leadCampaignId,
        text,
        fromPhone,
        toPhone: toPhone ?? null,
        telnyxId: telnyxId ?? null,
      })
    }

    // No campaign + no leads found → still log a Message orphaned to
    // contactId so it shows up in unattributed-message reports.
    if (matches.length === 0) {
      await Message.create({
        ...(leadCampaignId ? { leadCampaignId } : {}),
        channel: 'SMS',
        direction: 'INBOUND',
        body: text,
        from: fromPhone,
        to: toPhone,
        twilioSid: telnyxId,
      } as any)
    }

    return NextResponse.json({ ok: true, fannedOut: matches.length })
  } catch (err) {
    console.error('[webhook/telnyx sms]', err)
    return NextResponse.json({ ok: true, error: 'logged' })
  }
}

/**
 * Find every lead (Property) the caller's phone is attached to, across
 * all Contacts and all PropertyContact joins. Returns one entry per
 * Property — even when the same phone is on multiple Contacts that all
 * point at the same Property, the result is deduped.
 *
 * Used by both the SMS and Call paths so multi-lead callers see the
 * inbound activity on every attached lead.
 */
async function findAllLeadsForPhone(
  phone: string,
): Promise<Array<{ propertyId: string; contactId: string }>> {
  const rows = await Contact.findAll({
    where: { [Op.or]: [{ phone }, { phone2: phone }] },
    attributes: ['id'],
    include: [
      {
        model: PropertyContact,
        as: 'properties',
        required: false,
        separate: true,
        attributes: ['propertyId', 'contactId', 'isPrimary'],
        order: [['isPrimary', 'DESC']],
      },
    ],
  })
  const seen = new Set<string>()
  const out: Array<{ propertyId: string; contactId: string }> = []
  for (const row of rows) {
    const plain = row.get({ plain: true }) as any
    const props = (plain.properties ?? []) as Array<{ propertyId: string; contactId: string }>
    for (const pc of props) {
      if (!pc.propertyId || seen.has(pc.propertyId)) continue
      seen.add(pc.propertyId)
      out.push({ propertyId: pc.propertyId, contactId: pc.contactId })
    }
  }
  return out
}

/**
 * Persist a single inbound SMS to ONE property: Conversation upsert,
 * Message insert, ActivityLog insert. Pulled out so the fan-out loop
 * stays readable.
 */
async function persistInboundSms(args: {
  propertyId: string
  contactId: string | null
  leadCampaignId: string | null
  text: string
  fromPhone: string
  toPhone: string | null
  telnyxId: string | null
}): Promise<void> {
  const { propertyId, contactId, leadCampaignId, text, fromPhone, toPhone, telnyxId } = args

  const where = contactId ? { propertyId, contactId } : { propertyId, contactId: null }
  let conversation: any = await Conversation.findOne({ where })
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

  await Message.create({
    propertyId,
    conversationId: conversation.id,
    ...(contactId ? { contactId } : {}),
    ...(leadCampaignId ? { leadCampaignId } : {}),
    channel: 'SMS',
    direction: 'INBOUND',
    body: text,
    from: fromPhone,
    to: toPhone,
    twilioSid: telnyxId,
  } as any)

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
    // Telnyx sends direction='incoming' on call.initiated; older docs
    // sometimes show 'inbound'. Accept both so the webhook works
    // regardless of Voice App configuration.
    const isInbound = direction === 'incoming' || (direction as any) === 'inbound'
    if (eventType === 'call.initiated' && isInbound && fromPhone && toPhone) {
      const existing = await ActiveCall.findOne({
        where: { conferenceName: callControlId },
      }).catch(() => null)
      if (!existing) {
        // 1) Resolve which CRM number was called → which campaign owns it.
        const { leadCampaignId, leadCampaignType } = await resolveCampaignByPhone(toPhone)

        // 2) Look up the caller. If they're tied to ANY existing
        //    property — under any campaign — attribute the call there
        //    (no duplicate lead). Otherwise auto-create a lead so the
        //    call doesn't vanish.
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

        console.log(
          `[webhook/telnyx call.initiated] from=${fromPhone} to=${toPhone} existingContact=${existingContactId ?? '(none)'} attachedProperty=${propertyId ?? '(none)'} campaign=${leadCampaignId ?? '(none)'}`,
        )

        // Auto-create only when the dialed number is owned by a Lead
        // Campaign — that's the campaign the new lead lands under.
        // Without a campaign, we let the call still ring (popup polls
        // ActiveCall directly) but skip lead creation.
        if (!propertyId && leadCampaignId) {
          propertyId = await autoCreateInboundLead({
            fromPhone,
            leadCampaignId,
            leadCampaignType,
            existingContactId,
          })
          console.log(
            `[webhook/telnyx call.initiated] auto-created lead ${propertyId ?? '(failed)'} for ${fromPhone} under campaign ${leadCampaignId}`,
          )
        } else if (!propertyId) {
          console.warn(
            `[webhook/telnyx call.initiated] no campaign owns dialed number ${toPhone} — skipping auto-create. Assign this number to a Lead Campaign to enable auto-lead creation.`,
          )
        }

        await ActiveCall.create({
          conferenceName: callControlId,
          customerPhone: fromPhone,
          direction: 'INBOUND',
          status: 'RINGING',
          ...(propertyId ? { propertyId } : {}),
          ...(leadCampaignId ? { leadCampaignId } : {}),
        } as any)

        // NOTE: previously we issued a Telnyx /actions/answer command
        // here to prevent the call from timing out. That auto-answered
        // within ~1s, flipping the ActiveCall from RINGING → ACTIVE
        // before the polling popup (3s interval) could surface it.
        // Removed — the call now stays RINGING until either the agent
        // clicks Answer in the popup or Telnyx times out the call
        // (~30s default). Once we wire up SIP-routed browser ringing
        // via WebRTC TelephonyCredentials this becomes a non-issue.
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
  leadCampaignId: string | null
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
          // Skip the FK when null so Sequelize doesn't try to insert null
          // into a NOT NULL column on schemas that require it.
          ...(leadCampaignId ? { leadCampaignId } : {}),
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
