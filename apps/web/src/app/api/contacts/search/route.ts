import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Buyer, Contact, Vendor, Op, literal, sequelize } from '@crm/database'

/**
 * GET /api/contacts/search?type=BUYER|VENDOR&field=firstName|lastName|phone|email&q=...
 *
 * Powers the typeahead on the Add/Edit Buyer / Vendor forms. Returns
 * up to 10 candidate contacts whose specified field starts with /
 * contains the query string, including the resolved entity id so the
 * UI can offer "did you mean an existing contact?" plus "Open it" /
 * "Continue creating" affordances.
 *
 * The phones[] / emails[] JSONB arrays are searched alongside the
 * legacy phone / email columns so a match works whether the data was
 * authored via the new multi-row UI or the old single-field form.
 */

const ALLOWED_FIELDS = new Set(['firstName', 'lastName', 'phone', 'email'])

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const type = (sp.get('type') ?? 'BUYER').toUpperCase()
  const field = sp.get('field') ?? 'firstName'
  const q = (sp.get('q') ?? '').trim()
  if (!ALLOWED_FIELDS.has(field)) {
    return NextResponse.json({ error: `Unknown field: ${field}` }, { status: 400 })
  }
  if (q.length < 2) {
    return NextResponse.json({ data: [] })
  }

  const isPhone = field === 'phone'
  const isEmail = field === 'email'
  const escaped = q.replace(/'/g, "''")
  const escapedDigits = q.replace(/\D/g, '').replace(/'/g, "''")

  // Build the WHERE clause. For string-typed fields we ILIKE; for
  // phone we also strip non-digits and substring-match digits-only
  // so "+1 (469)" finds "+14694850786". Phones and emails also have
  // to scan the JSONB arrays.
  let where: any
  if (isPhone) {
    where = {
      [Op.or]: [
        { phone: { [Op.iLike]: `%${q}%` } },
        ...(escapedDigits.length >= 4
          ? [
              {
                phone: {
                  [Op.iLike]: `%${escapedDigits}%`,
                },
              },
            ]
          : []),
        // JSONB array scan — `phones @> '[{"number":"..."}]'` would
        // require an exact match; for substring search we cast to
        // text and ILIKE.
        literal(`"phones"::text ILIKE '%${escaped}%'`),
        ...(escapedDigits.length >= 4
          ? [literal(`"phones"::text ILIKE '%${escapedDigits}%'`)]
          : []),
      ],
    }
  } else if (isEmail) {
    where = {
      [Op.or]: [
        { email: { [Op.iLike]: `%${q}%` } },
        literal(`"emails"::text ILIKE '%${escaped}%'`),
      ],
    }
  } else {
    // firstName / lastName — straight column ILIKE.
    where = {
      [field]: { [Op.iLike]: `${q}%` },
    }
  }

  // Scope to the right contact type so the buyer form doesn't see
  // vendors and vice-versa.
  if (type === 'BUYER' || type === 'AGENT') {
    where = { ...where, type: { [Op.in]: ['BUYER', 'AGENT'] as any } }
  } else if (type === 'VENDOR') {
    where = { ...where, type: 'VENDOR' as any }
  }

  const rows = await Contact.findAll({
    where,
    attributes: ['id', 'firstName', 'lastName', 'phone', 'email', 'phones', 'emails', 'type'],
    limit: 10,
    order: [['firstName', 'ASC']],
  })

  // Hydrate the entity id (Buyer.id or Vendor.id) for each Contact
  // so the UI can deep-link to the entity detail page when the user
  // picks a match.
  const ids = rows.map((r) => r.get('id') as string)
  let buyerByContact = new Map<string, string>()
  let vendorByContact = new Map<string, string>()
  if (ids.length > 0) {
    if (type === 'BUYER' || type === 'AGENT') {
      const buyers = await Buyer.findAll({
        where: { contactId: { [Op.in]: ids } } as any,
        attributes: ['id', 'contactId'],
        raw: true,
      })
      buyerByContact = new Map(
        (buyers as any[]).map((b) => [b.contactId as string, b.id as string]),
      )
    } else if (type === 'VENDOR') {
      const vendors = await Vendor.findAll({
        where: { contactId: { [Op.in]: ids } } as any,
        attributes: ['id', 'contactId'],
        raw: true,
      })
      vendorByContact = new Map(
        (vendors as any[]).map((v) => [v.contactId as string, v.id as string]),
      )
    }
  }

  const data = rows.map((r) => {
    const j = r.get({ plain: true }) as any
    return {
      contactId: j.id as string,
      buyerId: buyerByContact.get(j.id) ?? null,
      vendorId: vendorByContact.get(j.id) ?? null,
      firstName: j.firstName ?? '',
      lastName: j.lastName ?? '',
      phone: j.phone ?? '',
      email: j.email ?? '',
      type: j.type,
      phones: Array.isArray(j.phones) ? j.phones : [],
      emails: Array.isArray(j.emails) ? j.emails : [],
    }
  })

  return NextResponse.json({ data })
}
