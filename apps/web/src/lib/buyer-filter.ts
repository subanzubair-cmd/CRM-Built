/**
 * Resolve a buyer-filter spec (or an explicit list of buyerIds) into
 * a deduped list of {subjectType, subjectId, phone} recipients ready
 * for a bulk SMS blast.
 *
 * `BuyerFilterParams` is intentionally permissive — the Quick Filter
 * UI authors a JSONB blob and we translate it here. The v1 ships
 * support for the most common subset; unknown keys are ignored
 * rather than rejected so saved filters from a future schema upgrade
 * still function.
 */

import { Buyer, Contact, Op, literal, type WhereOptions } from '@crm/database'

export interface BuyerFilterParams {
  /** Quick Filter parameter values, keyed by parameter id. */
  [k: string]: unknown
}

export interface ResolvedRecipient {
  subjectType: 'CONTACT' | 'BUYER'
  subjectId: string
  phone: string
}

/**
 * Pull the primary phone off a contact's phones[] array, falling
 * back to the legacy phone column if phones is empty (older rows).
 */
function pickPrimaryPhone(contact: any): string | null {
  if (Array.isArray(contact?.phones) && contact.phones.length > 0) {
    const primary =
      contact.phones.find((p: any) => p?.label === 'primary') ??
      contact.phones[0]
    return typeof primary?.number === 'string' && primary.number ? primary.number : null
  }
  return contact?.phone ?? null
}

export async function resolveBuyerRecipients({
  buyerIds,
  filter,
}: {
  buyerIds: string[]
  filter: BuyerFilterParams | null
}): Promise<ResolvedRecipient[]> {
  const where: WhereOptions = { isActive: true } as WhereOptions

  if (buyerIds.length > 0) {
    ;(where as any).id = { [Op.in]: buyerIds }
  }

  // Apply filter params we recognise. Unknown keys are silently
  // ignored to keep saved filters forward-compatible.
  if (filter) {
    if (Array.isArray(filter.targetCities) && filter.targetCities.length > 0) {
      ;(where as any).id = {
        [Op.in]: literal(
          `(SELECT id FROM "Buyer" WHERE "targetCities" && ARRAY[${(filter.targetCities as string[])
            .map((c) => `'${c.replace(/'/g, "''")}'`)
            .join(',')}]::TEXT[])`,
        ),
      }
    }
    if (filter.vipFlag === true) {
      ;(where as any).vipFlag = true
    }
  }

  const buyers = await Buyer.findAll({
    where,
    include: [
      {
        model: Contact,
        as: 'contact',
        attributes: ['id', 'phone', 'phone2', 'phones', 'doNotText'],
        required: true,
      },
    ],
    limit: 5000,
  })

  const out: ResolvedRecipient[] = []
  const seen = new Set<string>()
  for (const b of buyers) {
    const plain = b.get({ plain: true }) as any
    if (plain.contact?.doNotText) continue
    const phone = pickPrimaryPhone(plain.contact)
    if (!phone) continue
    if (seen.has(phone)) continue
    seen.add(phone)
    out.push({ subjectType: 'BUYER', subjectId: plain.id, phone })
  }
  return out
}
