import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
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
  const offers = await prisma.leadOffer.findMany({
    where: { propertyId: id },
    orderBy: { offerDate: 'asc' },
  })

  // Get user names for createdById
  const userIds = [...new Set(offers.map((o) => o.createdById).filter(Boolean))] as string[]
  const users = userIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : []
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

  // Serialize Decimals + add user name
  const data = offers.map((o) => ({
    ...o,
    offerPrice: Number(o.offerPrice),
    offerDate: o.offerDate.toISOString(),
    createdAt: o.createdAt.toISOString(),
    createdByName: o.createdById ? (userMap[o.createdById] ?? 'Unknown') : null,
  }))

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny

  const { id } = await params
  const property = await prisma.property.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const userId = ((session as any)?.user?.id ?? null) as string | null

  const offer = await prisma.leadOffer.create({
    data: {
      propertyId: id,
      offerBy: parsed.data.offerBy,
      offerDate: new Date(parsed.data.offerDate + 'T12:00:00'),
      offerType: parsed.data.offerType,
      offerPrice: parsed.data.offerPrice,
      createdById: userId,
    },
  })

  return NextResponse.json({ success: true, data: { ...offer, offerPrice: Number(offer.offerPrice) } }, { status: 201 })
}
