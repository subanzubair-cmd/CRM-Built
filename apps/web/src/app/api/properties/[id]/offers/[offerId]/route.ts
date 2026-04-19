import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const PatchSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED']),
})

type Params = { params: Promise<{ id: string; offerId: string }> }

// PATCH /api/properties/[id]/offers/[offerId]
// Accept or reject a specific offer. Accepting automatically rejects all other pending offers.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id, offerId } = await params
  const body = await req.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { status } = parsed.data

  // Verify the offer exists and belongs to this property
  const offer = await prisma.buyerOffer.findFirst({
    where: { id: offerId, propertyId: id },
    include: {
      buyer: { include: { contact: { select: { firstName: true, lastName: true } } } },
    },
  })
  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

  // Get property for activity log and notification target
  const property = await prisma.property.findUnique({
    where: { id },
    select: { assignedToId: true, streetAddress: true },
  })

  const buyerName = `${offer.buyer.contact.firstName} ${offer.buyer.contact.lastName ?? ''}`.trim()
  const amount = `$${Number(offer.dispoOfferAmount).toLocaleString()}`

  if (status === 'ACCEPTED') {
    // Accept this offer
    await prisma.buyerOffer.update({
      where: { id: offerId },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    })

    // Reject all other pending offers for this property (one accepted offer per property)
    await prisma.buyerOffer.updateMany({
      where: { propertyId: id, id: { not: offerId }, status: 'PENDING' },
      data: { status: 'REJECTED', respondedAt: new Date() },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        propertyId: id,
        userId,
        action: 'OFFER_ACCEPTED',
        detail: { description: `Offer of ${amount} from ${buyerName} accepted` },
      },
    })

    // Notify assigned user
    if (property?.assignedToId) {
      await prisma.notification.create({
        data: {
          userId: property.assignedToId,
          type: 'SYSTEM',
          title: 'Offer Accepted',
          body: `Offer of ${amount} from ${buyerName} on ${property.streetAddress ?? 'property'} was accepted`,
          propertyId: id,
        },
      })
    }
  } else {
    // Reject this offer
    await prisma.buyerOffer.update({
      where: { id: offerId },
      data: { status: 'REJECTED', respondedAt: new Date() },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        propertyId: id,
        userId,
        action: 'PIPELINE_CHANGE',
        detail: { description: `Offer of ${amount} from ${buyerName} rejected` },
      },
    })

    // Notify assigned user
    if (property?.assignedToId) {
      await prisma.notification.create({
        data: {
          userId: property.assignedToId,
          type: 'SYSTEM',
          title: 'Offer Rejected',
          body: `Offer of ${amount} from ${buyerName} on ${property.streetAddress ?? 'property'} was rejected`,
          propertyId: id,
        },
      })
    }
  }

  return NextResponse.json({ success: true })
}
