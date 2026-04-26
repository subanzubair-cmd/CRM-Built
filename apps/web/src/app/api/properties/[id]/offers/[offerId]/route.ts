import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  Property,
  BuyerOffer,
  Buyer,
  Contact,
  ActivityLog,
  Notification,
  Op,
  sequelize,
} from '@crm/database'
import { z } from 'zod'

const PatchSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED']),
})

type Params = { params: Promise<{ id: string; offerId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id, offerId } = await params
  const body = await req.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { status } = parsed.data

  const offerRow = await BuyerOffer.findOne({
    where: { id: offerId, propertyId: id },
    include: [
      {
        model: Buyer,
        as: 'buyer',
        include: [{ model: Contact, as: 'contact', attributes: ['firstName', 'lastName'] }],
      },
    ],
  })
  if (!offerRow) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  const offer = offerRow.get({ plain: true }) as any

  const property = await Property.findByPk(id, {
    attributes: ['assignedToId', 'streetAddress'],
    raw: true,
  }) as any

  const buyerName = `${offer.buyer.contact.firstName} ${offer.buyer.contact.lastName ?? ''}`.trim()
  const amount = `$${Number(offer.dispoOfferAmount).toLocaleString()}`

  await sequelize.transaction(async (tx) => {
    if (status === 'ACCEPTED') {
      await BuyerOffer.update(
        { status: 'ACCEPTED', respondedAt: new Date() },
        { where: { id: offerId }, transaction: tx },
      )
      await BuyerOffer.update(
        { status: 'REJECTED', respondedAt: new Date() },
        { where: { propertyId: id, id: { [Op.ne]: offerId }, status: 'PENDING' }, transaction: tx },
      )
      await ActivityLog.create({
        propertyId: id,
        userId,
        action: 'OFFER_ACCEPTED',
        detail: { description: `Offer of ${amount} from ${buyerName} accepted` },
      } as any, { transaction: tx })
      if (property?.assignedToId) {
        await Notification.create({
          userId: property.assignedToId,
          type: 'SYSTEM',
          title: 'Offer Accepted',
          body: `Offer of ${amount} from ${buyerName} on ${property.streetAddress ?? 'property'} was accepted`,
          propertyId: id,
        } as any, { transaction: tx })
      }
    } else {
      await BuyerOffer.update(
        { status: 'REJECTED', respondedAt: new Date() },
        { where: { id: offerId }, transaction: tx },
      )
      await ActivityLog.create({
        propertyId: id,
        userId,
        action: 'PIPELINE_CHANGE',
        detail: { description: `Offer of ${amount} from ${buyerName} rejected` },
      } as any, { transaction: tx })
      if (property?.assignedToId) {
        await Notification.create({
          userId: property.assignedToId,
          type: 'SYSTEM',
          title: 'Offer Rejected',
          body: `Offer of ${amount} from ${buyerName} on ${property.streetAddress ?? 'property'} was rejected`,
          propertyId: id,
        } as any, { transaction: tx })
      }
    }
  })

  return NextResponse.json({ success: true })
}
