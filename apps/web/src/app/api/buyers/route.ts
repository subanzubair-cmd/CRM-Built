import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Buyer, Contact, Op, literal } from '@crm/database'
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

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateBuyerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const data = parsed.data

  // Compute the canonical primary phone/email — pulled from phones[0] /
  // emails[0] when present, else fall back to the legacy phone/email
  // fields. This keeps existing readers (e.g. the legacy buyers blast
  // route) working while the multi-value UI rolls out.
  const primaryPhone = data.phones[0]?.number ?? data.phone ?? null
  const primaryEmail = data.emails[0]?.email ?? data.email ?? null

  if (primaryPhone || primaryEmail) {
    const duplicateContact = await Contact.findOne({
      where: {
        type: data.contactType,
        [Op.or]: [
          ...(primaryPhone ? [{ phone: primaryPhone }] : []),
          ...(primaryEmail ? [{ email: primaryEmail }] : []),
        ],
      },
      include: [{ model: Buyer, as: 'buyerProfile', attributes: ['id'] }],
    })
    if (duplicateContact) {
      const dup = duplicateContact.get({ plain: true }) as any
      return NextResponse.json({
        error: `A ${data.contactType === 'AGENT' ? 'agent' : 'buyer'} with this ${dup.phone === primaryPhone ? 'phone number' : 'email'} already exists: ${dup.firstName} ${dup.lastName ?? ''}`.trim(),
        existingBuyerId: dup.buyerProfile?.id,
      }, { status: 409 })
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
