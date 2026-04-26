import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Property, BuyerOffer, ActivityLog, sequelize } from '@crm/database'
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
  const property = await Property.findByPk(id, { attributes: ['id'], raw: true })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const body = await req.json()

  const updateParsed = UpdateOfferStatusSchema.safeParse(body)
  if (updateParsed.success) {
    const offerRow = await BuyerOffer.findByPk(updateParsed.data.offerId)
    if (!offerRow) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    await offerRow.update({
      status: updateParsed.data.status,
      respondedAt: new Date(),
    })
    const offer = offerRow.get({ plain: true }) as any
    if (updateParsed.data.status === 'ACCEPTED') {
      await sequelize.transaction(async (tx) => {
        await Property.update(
          { propertyStatus: 'SOLD', soldAt: new Date(), inDispo: false },
          { where: { id }, transaction: tx },
        )
        await ActivityLog.create({
          propertyId: id,
          userId,
          action: 'OFFER_ACCEPTED',
          detail: { description: `Offer of $${offer.dispoOfferAmount} accepted` },
        } as any, { transaction: tx })
      })
    }
    return NextResponse.json({ success: true, data: offer })
  }

  const parsed = CreateOfferSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const result = await sequelize.transaction(async (tx) => {
    const offer = await BuyerOffer.create({
      propertyId: id,
      buyerId: parsed.data.buyerId,
      dispoOfferAmount: parsed.data.dispoOfferAmount,
      notes: parsed.data.notes,
      status: 'PENDING',
    } as any, { transaction: tx })

    await ActivityLog.create({
      propertyId: id,
      userId,
      action: 'OFFER_RECEIVED',
      detail: { description: `Buyer offer of $${parsed.data.dispoOfferAmount} recorded` },
    } as any, { transaction: tx })

    return offer
  })

  return NextResponse.json({ success: true, data: result }, { status: 201 })
}
