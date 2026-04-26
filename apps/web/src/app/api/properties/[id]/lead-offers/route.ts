import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Property, LeadOffer, User, Op } from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const CreateSchema = z.object({
  offerBy: z.enum(['OUR_OFFER', 'SELLER_OFFER']),
  offerDate: z.string(),
  offerType: z.enum(['VERBAL', 'WRITTEN']),
  offerPrice: z.number().positive(),
})

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.view')
  if (deny) return deny

  const { id } = await params
  const offers = await LeadOffer.findAll({
    where: { propertyId: id },
    order: [['offerDate', 'ASC']],
    raw: true,
  }) as any[]

  const userIds = [...new Set(offers.map((o) => o.createdById).filter(Boolean))] as string[]
  const users = userIds.length > 0
    ? await User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['id', 'name'], raw: true }) as any[]
    : []
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

  const data = offers.map((o) => ({
    ...o,
    offerPrice: Number(o.offerPrice),
    offerDate: new Date(o.offerDate).toISOString(),
    createdAt: new Date(o.createdAt).toISOString(),
    createdByName: o.createdById ? (userMap[o.createdById] ?? 'Unknown') : null,
  }))

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny

  const { id } = await params
  const property = await Property.findByPk(id, { attributes: ['id'], raw: true })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const userId = ((session as any)?.user?.id ?? null) as string | null

  const offer = await LeadOffer.create({
    propertyId: id,
    offerBy: parsed.data.offerBy,
    offerDate: new Date(parsed.data.offerDate + 'T12:00:00'),
    offerType: parsed.data.offerType,
    offerPrice: parsed.data.offerPrice,
    createdById: userId,
  } as any)

  const plain = offer.get({ plain: true }) as any
  return NextResponse.json({ success: true, data: { ...plain, offerPrice: Number(plain.offerPrice) } }, { status: 201 })
}
