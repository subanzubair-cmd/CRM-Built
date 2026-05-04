/**
 * activity-mirror.ts — Cross-lead activity mirroring.
 *
 * When two leads share the same phone number or email address, any future
 * communication activity on either lead should also appear in the other
 * lead's activity feed. This module provides:
 *
 *   findLeadsForPhone(phone, excludePropertyId?)
 *   findLeadsForEmail(email, excludePropertyId?)
 *   mirrorCommunicationToRelatedLeads(opts)
 *
 * Mirror writes are always fire-and-forget — failures are logged and
 * swallowed so they never block or roll back the original action.
 */

import {
  Contact,
  PropertyContact,
  Property,
  ActivityLog,
  Conversation,
  Message,
  Op,
  literal,
  sequelize,
} from '@crm/database'
import { phoneVariants } from '@crm/shared'

interface LeadRef {
  propertyId: string
  /**
   * The Contact row that holds the matching phone (or email) on this lead.
   * Needed when the mirror also creates Message rows — Message.contactId
   * and Conversation.contactId both expect the lead-local contact, not
   * the origin lead's contact.
   */
  contactId: string | null
  address: string | null
}

/**
 * Find all leads (Properties) that have a contact with the given phone
 * number attached, excluding `excludePropertyId`.
 */
export async function findLeadsForPhone(
  phone: string,
  excludePropertyId?: string | null,
): Promise<LeadRef[]> {
  const variants = phoneVariants(phone)
  if (variants.length === 0) return []

  // Build digit-only variants for JSONB substring search (same approach as dedupe.ts).
  const digits = phone.replace(/\D/g, '')
  const last10 = digits.slice(-10)

  const rows = await Contact.findAll({
    where: {
      [Op.or]: [
        { phone: { [Op.in]: variants } },
        { phone2: { [Op.in]: variants } },
        // Also match contacts where the phone is only in the JSONB phones[] array
        ...(last10.length >= 7
          ? [literal(`"Contact"."phones"::text ILIKE ${sequelize.escape(`%${last10}%`)}`)]
          : []),
      ],
    } as any,
    attributes: ['id'],
    include: [
      {
        model: PropertyContact,
        as: 'properties',
        required: false,
        separate: true,
        attributes: ['propertyId'],
        include: [
          {
            model: Property,
            as: 'property',
            attributes: ['id', 'streetAddress', 'city', 'state'],
          },
        ],
      },
    ],
  })

  const seen = new Set<string>()
  const out: LeadRef[] = []

  for (const row of rows) {
    const plain = row.get({ plain: true }) as any
    const contactId = (plain.id as string) ?? null
    const props = (plain.properties ?? []) as Array<{
      propertyId: string
      property: { id: string; streetAddress: string | null; city: string | null; state: string | null } | null
    }>
    for (const pc of props) {
      if (!pc.propertyId) continue
      if (excludePropertyId && pc.propertyId === excludePropertyId) continue
      if (seen.has(pc.propertyId)) continue
      seen.add(pc.propertyId)
      const p = pc.property
      const address = p
        ? [p.streetAddress, p.city, p.state].filter(Boolean).join(', ') || null
        : null
      out.push({ propertyId: pc.propertyId, contactId, address })
    }
  }

  return out
}

/**
 * Find all leads (Properties) that have a contact with the given email
 * address attached, excluding `excludePropertyId`.
 */
export async function findLeadsForEmail(
  email: string,
  excludePropertyId?: string | null,
): Promise<LeadRef[]> {
  const lower = email.toLowerCase()

  // Broad fetch: match on the scalar `email` column (case-insensitive)
  // OR contacts whose `emails` JSONB array contains the address.
  // Exact deduplication is enforced in-process below.
  const emailPattern = `%${lower}%`
  const rows = await Contact.findAll({
    where: {
      [Op.or]: [
        { email: { [Op.iLike]: lower } },
        // Substring match on the JSONB-cast-to-text for a broad net;
        // the in-process filter below enforces exact email equality.
        literal(`"Contact"."emails"::text ILIKE ${sequelize.escape(emailPattern)}`),
      ],
    } as any,
    attributes: ['id', 'email', 'emails'],
    include: [
      {
        model: PropertyContact,
        as: 'properties',
        required: false,
        separate: true,
        attributes: ['propertyId'],
        include: [
          {
            model: Property,
            as: 'property',
            attributes: ['id', 'streetAddress', 'city', 'state'],
          },
        ],
      },
    ],
  })

  // Filter in-process: check scalar email + emails JSONB array.
  const seen = new Set<string>()
  const out: LeadRef[] = []

  for (const row of rows) {
    const plain = row.get({ plain: true }) as any
    const contactId = (plain.id as string) ?? null
    const contactEmail: string | null = plain.email
    const contactEmails: Array<{ label: string; email: string }> = plain.emails ?? []

    const emailMatches =
      (contactEmail && contactEmail.toLowerCase() === lower) ||
      contactEmails.some((e) => e.email.toLowerCase() === lower)

    if (!emailMatches) continue

    const props = (plain.properties ?? []) as Array<{
      propertyId: string
      property: { id: string; streetAddress: string | null; city: string | null; state: string | null } | null
    }>
    for (const pc of props) {
      if (!pc.propertyId) continue
      if (excludePropertyId && pc.propertyId === excludePropertyId) continue
      if (seen.has(pc.propertyId)) continue
      seen.add(pc.propertyId)
      const p = pc.property
      const address = p
        ? [p.streetAddress, p.city, p.state].filter(Boolean).join(', ') || null
        : null
      out.push({ propertyId: pc.propertyId, contactId, address })
    }
  }

  return out
}

export interface MirrorOpts {
  originPropertyId: string
  phone?: string | null
  email?: string | null
  action: string
  detail: Record<string, unknown>
  userId?: string | null
  actorType?: string
  /**
   * When provided AND `phone` matched related leads, the mirror also
   * writes a real `Message` row (with a Conversation upsert) into each
   * related lead — so the Comm & Notes feed renders the SMS/call thread
   * on every lead the number is currently attached to, just like the
   * inbound SMS fan-out does on the webhook side.
   *
   * Forward-only: the mirror still runs at write-time of new comms, so
   * adding a phone to a lead never backfills past activity. Leads remain
   * fully independent — each gets its own Message + Conversation rows.
   *
   * Leave undefined for pure ActivityLog mirroring (NOTE, EMAIL, or
   * legacy callers that don't want comms-feed visibility).
   */
  message?: {
    channel: 'SMS' | 'CALL'
    direction: 'INBOUND' | 'OUTBOUND'
    body: string | null
    from: string | null
    to: string | null
    /**
     * Provider id for cross-mirror continuity. For CALL this is the
     * ActiveCall.id (so the recording player resolves the same audio
     * from any mirrored lead); for SMS it's the provider message uuid.
     */
    twilioSid: string | null
  } | null
}

/**
 * Mirror a communication ActivityLog entry to all other leads that share
 * the same phone number or email address as the origin lead.
 *
 * Always fire-and-forget — wrap the call in `void` at the call site.
 * Failures are logged but never propagate to the caller.
 *
 * ⚠️  RECURSION SAFETY: This function is safe from infinite recursion TODAY
 * because it is only called from route handlers and webhook handlers, NOT
 * from a Sequelize model hook or afterCreate listener. If you ever add an
 * ActivityLog.afterCreate hook, do NOT call mirrorCommunicationToRelatedLeads
 * from inside it — mirrored logs would trigger re-entry immediately.
 */
export async function mirrorCommunicationToRelatedLeads(opts: MirrorOpts): Promise<void> {
  try {
    const { originPropertyId, phone, email, action, detail, userId, actorType = 'system', message } = opts

    // Collect all related leads, deduped by propertyId. Track contactId so
    // the optional Message fan-out knows which contact each lead's
    // Conversation + Message should attach to.
    const relatedMap = new Map<
      string,
      { address: string | null; contactId: string | null }
    >()

    if (phone) {
      const phoneLeads = await findLeadsForPhone(phone, originPropertyId)
      for (const ref of phoneLeads) {
        relatedMap.set(ref.propertyId, { address: ref.address, contactId: ref.contactId })
      }
    }

    if (email) {
      const emailLeads = await findLeadsForEmail(email, originPropertyId)
      for (const ref of emailLeads) {
        if (!relatedMap.has(ref.propertyId)) {
          relatedMap.set(ref.propertyId, { address: ref.address, contactId: ref.contactId })
        }
      }
    }

    if (relatedMap.size === 0) return

    // Fetch the origin property's address for the "Mirrored from X" label.
    const originProp = (await Property.findByPk(originPropertyId, {
      attributes: ['streetAddress', 'city', 'state'],
      raw: true,
    })) as { streetAddress: string | null; city: string | null; state: string | null } | null

    const originAddress =
      originProp
        ? [originProp.streetAddress, originProp.city, originProp.state].filter(Boolean).join(', ') || null
        : null

    // Write a mirrored ActivityLog for each related property (always).
    const activityCreates = Array.from(relatedMap.entries()).map(([propertyId]) =>
      ActivityLog.create({
        propertyId,
        userId: userId ?? null,
        actorType,
        action,
        mirroredFromPropertyId: originPropertyId,
        detail: {
          ...detail,
          mirroredFromAddress: originAddress,
        },
      } as any).catch((err) => {
        console.warn(
          `[activity-mirror] failed to create mirror ActivityLog for property ${propertyId}:`,
          err,
        )
      }),
    )

    // When the caller supplied a `message` payload, also fan out a real
    // Conversation + Message into each related lead so the Comm & Notes
    // feed (which reads Message rows, not ActivityLog) renders the
    // SMS/call thread there too. Mirrors the inbound SMS webhook
    // fan-out pattern; each lead gets its OWN Conversation +
    // Message — leads stay fully independent.
    const messageCreates = message
      ? Array.from(relatedMap.entries()).map(async ([propertyId, ref]) => {
          try {
            // Find or create the Conversation for this lead's contact.
            // Same key as persistInboundSms in the Telnyx webhook —
            // (propertyId, contactId) — so a follow-up inbound SMS lands
            // on the same thread we just mirrored to.
            const where = ref.contactId
              ? { propertyId, contactId: ref.contactId }
              : { propertyId, contactId: null }
            let conversation: any = await Conversation.findOne({ where })
            if (!conversation) {
              conversation = await Conversation.create({
                propertyId,
                contactId: ref.contactId,
                contactPhone: phone ?? message.from ?? message.to ?? null,
                isRead: false,
                lastMessageAt: new Date(),
              } as any)
            } else {
              await conversation.update({ isRead: false, lastMessageAt: new Date() })
            }

            await Message.create({
              propertyId,
              conversationId: conversation.id,
              ...(ref.contactId ? { contactId: ref.contactId } : {}),
              channel: message.channel,
              direction: message.direction,
              body: message.body ?? '',
              ...(message.from ? { from: message.from } : {}),
              ...(message.to ? { to: message.to } : {}),
              ...(message.twilioSid ? { twilioSid: message.twilioSid } : {}),
              ...(userId ? { sentById: userId } : {}),
            } as any)
          } catch (err) {
            console.warn(
              `[activity-mirror] failed to mirror Message into property ${propertyId}:`,
              err,
            )
          }
        })
      : []

    await Promise.all([...activityCreates, ...messageCreates])
  } catch (err) {
    // Mirror failures must never surface to the caller.
    console.warn('[activity-mirror] mirrorCommunicationToRelatedLeads error:', err)
  }
}
