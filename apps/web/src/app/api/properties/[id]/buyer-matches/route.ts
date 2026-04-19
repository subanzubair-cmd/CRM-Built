import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const CreateSchema = z.object({
  buyerId: z.string().min(1),
  dispoStage: z.string().default('POTENTIAL_BUYER'),
})

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: propertyId } = await params
  const matches = await prisma.buyerMatch.findMany({
    where: { propertyId },
    include: {
      buyer: {
        include: { contact: { select: { firstName: true, lastName: true, phone: true, email: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ data: matches.map((m) => ({ ...m, score: Number(m.score), dispoOfferAmount: m.dispoOfferAmount ? Number(m.dispoOfferAmount) : null })) })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: propertyId } = await params
  const parsed = CreateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { buyerId, dispoStage } = parsed.data

  // Check if this buyer is already matched to this property
  const existing = await prisma.buyerMatch.findFirst({
    where: { propertyId, buyerId },
  })
  if (existing) {
    return NextResponse.json({ error: 'This buyer is already matched to this property' }, { status: 409 })
  }

  const match = await prisma.buyerMatch.create({
    data: {
      propertyId,
      buyerId,
      dispoStage: dispoStage as any,
      score: 0,
    },
  })

  return NextResponse.json({ success: true, data: match }, { status: 201 })
}
