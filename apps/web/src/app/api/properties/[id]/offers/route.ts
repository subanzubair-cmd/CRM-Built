import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'

const CreateOfferSchema = z.object({
  buyerId: z.string().min(1),
  dispoOfferAmount: z.number().positive(),
  notes: z.string().optional(),
})

const UpdateOfferStatusSchema = z.object({
  offerId: z.string().min(1),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED']),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params
  const property = await prisma.property.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const body = await req.json()

  // Check if it's an offer status update or new offer
  const updateParsed = UpdateOfferStatusSchema.safeParse(body)
  if (updateParsed.success) {
    const offer = await prisma.buyerOffer.update({
      where: { id: updateParsed.data.offerId },
      data: {
        status: updateParsed.data.status,
        respondedAt: new Date(),
      },
    })
    // If accepted, promote property to SOLD
    if (updateParsed.data.status === 'ACCEPTED') {
      await prisma.property.update({
        where: { id },
        data: {
          propertyStatus: 'SOLD',
          soldAt: new Date(),
          inDispo: false,
          activityLogs: {
            create: {
              userId,
              action: 'OFFER_ACCEPTED',
              detail: { description: `Offer of $${offer.dispoOfferAmount} accepted` },
            },
          },
        },
      })
    }
    return NextResponse.json({ success: true, data: offer })
  }

  const parsed = CreateOfferSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const offer = await prisma.buyerOffer.create({
    data: {
      propertyId: id,
      buyerId: parsed.data.buyerId,
      dispoOfferAmount: parsed.data.dispoOfferAmount,
      notes: parsed.data.notes,
      status: 'PENDING',
    },
  })

  await prisma.activityLog.create({
    data: {
      propertyId: id,
      userId,
      action: 'OFFER_RECEIVED',
      detail: { description: `Buyer offer of $${parsed.data.dispoOfferAmount} recorded` },
    },
  })

  return NextResponse.json({ success: true, data: offer }, { status: 201 })
}
