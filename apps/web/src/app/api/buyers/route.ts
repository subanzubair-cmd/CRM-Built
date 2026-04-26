import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Buyer, Contact, Op, literal } from '@crm/database'
import { getMarketScope } from '@/lib/auth-utils'
import { z } from 'zod'

const CreateBuyerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
  preferredMarkets: z.array(z.string()).default([]),
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

  const { firstName, lastName, email, phone, notes, preferredMarkets } = parsed.data

  if (phone || email) {
    const duplicateContact = await Contact.findOne({
      where: {
        type: 'BUYER',
        [Op.or]: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      include: [{ model: Buyer, as: 'buyerProfile', attributes: ['id'] }],
    })
    if (duplicateContact) {
      const dup = duplicateContact.get({ plain: true }) as any
      return NextResponse.json({
        error: `A buyer with this ${dup.phone === phone ? 'phone number' : 'email'} already exists: ${dup.firstName} ${dup.lastName ?? ''}`.trim(),
        existingBuyerId: dup.buyerProfile?.id,
      }, { status: 409 })
    }
  }

  const contact = await Contact.create({
    type: 'BUYER',
    firstName,
    lastName,
    email,
    phone,
  } as any)

  const buyerRow = await Buyer.create({
    contactId: contact.id,
    preferredMarkets,
    notes,
  } as any)

  const buyer = await Buyer.findByPk(buyerRow.id, {
    include: [{ model: Contact, as: 'contact' }],
  })

  return NextResponse.json({ success: true, data: buyer?.get({ plain: true }) }, { status: 201 })
}
