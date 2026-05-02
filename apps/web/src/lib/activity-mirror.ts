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
  Op,
  literal,
  sequelize,
} from '@crm/database'
import { phoneVariants } from '@crm/shared'

interface LeadRef {
  propertyId: string
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

  const rows = await Contact.findAll({
    where: {
      [Op.or]: [
        { phone: { [Op.in]: variants } },
        { phone2: { [Op.in]: variants } },
      ],
    },
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
      out.push({ propertyId: pc.propertyId, address })
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
      out.push({ propertyId: pc.propertyId, address })
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
}

/**
 * Mirror a communication ActivityLog entry to all other leads that share
 * the same phone number or email address as the origin lead.
 *
 * Always fire-and-forget — wrap the call in `void` at the call site.
 * Failures are logged but never propagate to the caller.
 */
export async function mirrorCommunicationToRelatedLeads(opts: MirrorOpts): Promise<void> {
  try {
    const { originPropertyId, phone, email, action, detail, userId, actorType = 'system' } = opts

    // Collect all related leads, deduped by propertyId.
    const relatedMap = new Map<string, string | null>() // propertyId → address

    if (phone) {
      const phoneLeads = await findLeadsForPhone(phone, originPropertyId)
      for (const ref of phoneLeads) {
        relatedMap.set(ref.propertyId, ref.address)
      }
    }

    if (email) {
      const emailLeads = await findLeadsForEmail(email, originPropertyId)
      for (const ref of emailLeads) {
        if (!relatedMap.has(ref.propertyId)) {
          relatedMap.set(ref.propertyId, ref.address)
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

    // Write a mirrored ActivityLog for each related property.
    const creates = Array.from(relatedMap.entries()).map(([propertyId]) =>
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

    await Promise.all(creates)
  } catch (err) {
    // Mirror failures must never surface to the caller.
    console.warn('[activity-mirror] mirrorCommunicationToRelatedLeads error:', err)
  }
}
