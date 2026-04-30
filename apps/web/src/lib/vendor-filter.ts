/**
 * Vendor mirror of `resolveBuyerRecipients`. Resolves a filter spec
 * or explicit vendorIds list into a deduped recipient set ready for
 * a bulk SMS blast.
 *
 * Phase 1: target geography / VIP / phone-type filtering aren't on
 * the Vendor model yet, so the filter blob is mostly ignored aside
 * from `vendorIds`. The shape stays compatible with the buyer
 * resolver so a future enrichment pass can swap field plumbing
 * without changing the call sites.
 */

import { Vendor, Contact, Op, type WhereOptions } from '@crm/database'

export interface VendorFilterParams {
  [k: string]: unknown
}

export interface ResolvedVendorRecipient {
  subjectType: 'CONTACT' | 'VENDOR'
  subjectId: string
  phone: string
}

function pickPrimaryPhone(contact: any): string | null {
  if (Array.isArray(contact?.phones) && contact.phones.length > 0) {
    const primary =
      contact.phones.find((p: any) => p?.label === 'primary') ??
      contact.phones[0]
    return typeof primary?.number === 'string' && primary.number ? primary.number : null
  }
  return contact?.phone ?? null
}

export async function resolveVendorRecipients({
  vendorIds,
  filter: _filter,
}: {
  vendorIds: string[]
  filter: VendorFilterParams | null
}): Promise<ResolvedVendorRecipient[]> {
  const where: WhereOptions = {}
  if (vendorIds.length > 0) {
    ;(where as any).id = { [Op.in]: vendorIds }
  }
  // Filter parameters (target geography, VIP, etc.) intentionally
  // ignored for Phase 1 vendors — the Vendor model doesn't carry
  // those columns yet. Filtering by selection still works.

  const vendors = await Vendor.findAll({
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

  const out: ResolvedVendorRecipient[] = []
  const seen = new Set<string>()
  for (const v of vendors) {
    const plain = v.get({ plain: true }) as any
    if (plain.contact?.doNotText) continue
    const phone = pickPrimaryPhone(plain.contact)
    if (!phone) continue
    if (seen.has(phone)) continue
    seen.add(phone)
    out.push({ subjectType: 'VENDOR', subjectId: plain.id, phone })
  }
  return out
}
