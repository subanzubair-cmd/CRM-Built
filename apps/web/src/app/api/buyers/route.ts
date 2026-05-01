import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Buyer, Contact, Op, literal, sequelize } from '@crm/database'
import { getMarketScope } from '@/lib/auth-utils'
import { z } from 'zod'

/**
 * `phones` / `emails` arrays match the Contact model's new multi-value
 * shape. Each entry is `{ label, number/email }`. The first entry is
 * mirrored to the legacy `phone` / `email` columns at write time so
 * existing readers keep working without a coordinated migration.
 */
const PhoneSchema = z.object({
  label: z.string().min(1).max(40).default('primary'),
  number: z.string().min(1).max(40),
})
const EmailSchema = z.object({
  label: z.string().min(1).max(40).default('primary'),
  email: z.string().email(),
})

const CreateBuyerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  /** Contact.type — Buyer (BUYER) or Agent (AGENT). Maps to the
   *  spec's "Contact Type *" radio. */
  contactType: z.enum(['BUYER', 'AGENT']).default('BUYER'),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  /** Multi-value phones/emails. If passed, the first entry overrides
   *  the legacy `phone` / `email` fields. */
  phones: z.array(PhoneSchema).default([]),
  emails: z.array(EmailSchema).default([]),
  mailingAddress: z.string().max(500).optional(),
  howHeardAbout: z.string().max(120).optional(),
  assignedUserId: z.string().nullable().optional(),
  notes: z.string().max(2000).optional(),
  preferredMarkets: z.array(z.string()).default([]),
  targetCities: z.array(z.string()).default([]),
  targetZips: z.array(z.string()).default([]),
  targetCounties: z.array(z.string()).default([]),
  targetStates: z.array(z.string()).default([]),
  customQuestions: z.record(z.unknown()).default({}),
  vipFlag: z.boolean().default(false),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const search = req.nextUrl.searchParams.get('search') ?? ''
  const scope = getMarketScope(session)

  const where: Record<string, unknown> = {}

  const contactInclude: any = {
    model: Contact,
    as: 'contact',
    attributes: ['firstName', 'lastName', 'phone', 'email'],
  }

  if (search.length >= 2) {
    const like = `%${search}%`
    contactInclude.where = {
      [Op.or]: [
        { firstName: { [Op.iLike]: like } },
        { lastName: { [Op.iLike]: like } },
        { email: { [Op.iLike]: like } },
        { phone: { [Op.like]: like } },
      ],
    }
    contactInclude.required = true
  }

  if (scope !== null) {
    if (scope.length === 0) {
      where.id = ''
    } else {
      const escaped = scope.map((m) => `'${m.replace(/'/g, "''")}'`).join(',')
      where.id = {
        [Op.in]: literal(`(SELECT id FROM "Buyer" WHERE "preferredMarkets" && ARRAY[${escaped}]::text[])`),
      }
    }
  }

  const buyers = await Buyer.findAll({
    where,
    include: [contactInclude],
    order: [['createdAt', 'DESC']],
    limit: 20,
    subQuery: false,
  })

  return NextResponse.json({ data: buyers.map((b) => b.get({ plain: true })) })
}

/**
 * SQL string-literal escaping for the `literal()` clauses below.
 * We doubled-up single quotes and wrap in quotes so the dedupe
 * subqueries don't break on input like "O'Brien" or "x' OR 1=1—".
 */
function escapeLiteral(v: string): string {
  return `'${String(v).replace(/'/g, "''")}'`
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateBuyerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const data = parsed.data

  // Collect ALL phones / emails across the new arrays + legacy
  // single-value columns. The canonical "primary" is index 0; the
  // dedupe + Contact write paths below want the full set so a buyer
  // is rejected as a duplicate even if the matching phone lives at
  // phones[1] of an existing row.
  const allPhones = [
    ...data.phones.map((p) => p.number).filter(Boolean),
    ...(data.phone ? [data.phone] : []),
  ]
  const allEmails = [
    ...data.emails.map((e) => e.email).filter(Boolean),
    ...(data.email ? [data.email] : []),
  ]
  const primaryPhone = allPhones[0] ?? null
  const primaryEmail = allEmails[0] ?? null

  // REQUIRED: at least one of phone OR email must be supplied. The
  // schema can't express "(at least one of A or B)" cleanly, so we
  // gate it here. Also acts as a defence in depth — clients that
  // bypass the form validation still get a 422.
  if (allPhones.length === 0 && allEmails.length === 0) {
    return NextResponse.json(
      {
        error:
          'Provide at least one phone number or email — buyers must be reachable to be useful.',
      },
      { status: 422 },
    )
  }

  // Dedupe across BOTH the legacy phone/email columns AND the new
  // phones[]/emails[] JSONB arrays. We cast the JSONB to text and
  // ILIKE for substring match — exact-match would miss when the
  // operator typed "(469) 555-0100" but the existing row stored
  // "+14695550100".
  const phoneDigitClauses = allPhones.flatMap((p) => {
    const digits = p.replace(/\D/g, '')
    return digits.length >= 7
      ? [literal(`"phone" = ${escapeLiteral(p)}`),
         literal(`"phones"::text ILIKE ${escapeLiteral(`%${digits}%`)}`)]
      : [literal(`"phone" = ${escapeLiteral(p)}`)]
  })
  const emailClauses = allEmails.flatMap((e) => [
    literal(`LOWER("email") = LOWER(${escapeLiteral(e)})`),
    literal(`"emails"::text ILIKE ${escapeLiteral(`%${e}%`)}`),
  ])
  if (phoneDigitClauses.length + emailClauses.length > 0) {
    const duplicateContact = await Contact.findOne({
      where: {
        type: data.contactType,
        [Op.or]: [...phoneDigitClauses, ...emailClauses] as any,
      },
      include: [{ model: Buyer, as: 'buyerProfile', attributes: ['id'] }],
    })
    if (duplicateContact) {
      const dup = duplicateContact.get({ plain: true }) as any
      return NextResponse.json(
        {
          error: `A ${data.contactType === 'AGENT' ? 'agent' : 'buyer'} with one of these phone numbers / emails already exists: ${[dup.firstName, dup.lastName].filter(Boolean).join(' ')}`,
          existingBuyerId: dup.buyerProfile?.id,
        },
        { status: 409 },
      )
    }
  }

  const contact = await Contact.create({
    type: data.contactType,
    firstName: data.firstName,
    lastName: data.lastName,
    email: primaryEmail,
    phone: primaryPhone,
    phones: data.phones,
    emails: data.emails,
    mailingAddress: data.mailingAddress,
    howHeardAbout: data.howHeardAbout,
    assignedUserId: data.assignedUserId ?? null,
  } as any)

  const buyerRow = await Buyer.create({
    contactId: contact.id,
    preferredMarkets: data.preferredMarkets,
    targetCities: data.targetCities,
    targetZips: data.targetZips,
    targetCounties: data.targetCounties,
    targetStates: data.targetStates,
    customQuestions: data.customQuestions,
    vipFlag: data.vipFlag,
    notes: data.notes,
  } as any)

  const buyer = await Buyer.findByPk(buyerRow.id, {
    include: [{ model: Contact, as: 'contact' }],
  })

  return NextResponse.json({ success: true, data: buyer?.get({ plain: true }) }, { status: 201 })
}
