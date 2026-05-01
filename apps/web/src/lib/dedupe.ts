/**
 * Shared duplicate-detection helper used by buyer and vendor
 * POST + PATCH routes. Queries the Contact table for existing
 * rows whose phone (digits-only) or email (case-insensitive)
 * matches any value in the provided arrays. Scans BOTH the legacy
 * single-value columns AND the JSONB phones[]/emails[] arrays.
 *
 * Returns the first matching Contact (with its buyer/vendor
 * profile id) or null.
 */

import { Buyer, Contact, Vendor, Op, literal } from '@crm/database'

function escapeLiteral(v: string): string {
  return `'${String(v).replace(/'/g, "''")}'`
}

interface DuplicateResult {
  contact: {
    id: string
    firstName: string | null
    lastName: string | null
    type: string
  }
  buyerId: string | null
  vendorId: string | null
}

export async function findDuplicateContact(opts: {
  allPhones: string[]
  allEmails: string[]
  contactType: string // 'BUYER' | 'AGENT' | 'VENDOR'
  excludeContactId?: string
}): Promise<DuplicateResult | null> {
  const { allPhones, allEmails, contactType, excludeContactId } = opts

  const phoneDigitClauses = allPhones.flatMap((p) => {
    const digits = p.replace(/\D/g, '')
    return digits.length >= 7
      ? [
          literal(`"phone" = ${escapeLiteral(p)}`),
          literal(`"phones"::text ILIKE ${escapeLiteral(`%${digits}%`)}`),
        ]
      : [literal(`"phone" = ${escapeLiteral(p)}`)]
  })
  const emailClauses = allEmails.flatMap((e) => [
    literal(`LOWER("email") = LOWER(${escapeLiteral(e)})`),
    literal(`"emails"::text ILIKE ${escapeLiteral(`%${e}%`)}`),
  ])

  if (phoneDigitClauses.length + emailClauses.length === 0) return null

  const where: any = {
    [Op.or]: [...phoneDigitClauses, ...emailClauses],
  }

  // Scope by contact type
  if (contactType === 'VENDOR') {
    where.type = 'VENDOR'
  } else {
    where.type = { [Op.in]: ['BUYER', 'AGENT'] }
  }

  // Exclude the current contact in edit mode
  if (excludeContactId) {
    where.id = { [Op.ne]: excludeContactId }
  }

  const duplicateContact = await Contact.findOne({
    where,
    attributes: ['id', 'firstName', 'lastName', 'type'],
  })

  if (!duplicateContact) return null

  const dup = duplicateContact.get({ plain: true }) as any

  // Resolve entity id
  let buyerId: string | null = null
  let vendorId: string | null = null

  if (dup.type === 'VENDOR') {
    const vendor = await Vendor.findOne({
      where: { contactId: dup.id } as any,
      attributes: ['id'],
      raw: true,
    })
    vendorId = (vendor as any)?.id ?? null
  } else {
    const buyer = await Buyer.findOne({
      where: { contactId: dup.id } as any,
      attributes: ['id'],
      raw: true,
      include: [],
    })
    buyerId = (buyer as any)?.id ?? null
  }

  return {
    contact: {
      id: dup.id,
      firstName: dup.firstName,
      lastName: dup.lastName,
      type: dup.type,
    },
    buyerId,
    vendorId,
  }
}
