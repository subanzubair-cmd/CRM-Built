import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Buyer, Contact, ActivityLog, sequelize } from '@crm/database'
import { z } from 'zod'

const ConvertToBuyerSchema = z.object({
  contactId: z.string().min(1),
  propertyId: z.string().min(1),
  preferredMarkets: z.array(z.string()).default([]),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionUser = (session as any)?.user ?? {}
  const userId = sessionUser.id as string
  const userName = (sessionUser.name ?? 'Unknown') as string

  const body = await req.json()
  const parsed = ConvertToBuyerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { contactId, propertyId, preferredMarkets } = parsed.data

  const contact = await Contact.findByPk(contactId)
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const existing = await Buyer.findOne({ where: { contactId } })
  if (existing) return NextResponse.json({ error: 'Already a buyer' }, { status: 409 })

  const result = await sequelize.transaction(async (tx) => {
    const buyer = await Buyer.create({
      contactId,
      isActive: true,
      preferredMarkets,
    } as any, { transaction: tx })

    await contact.update({ type: 'BUYER' }, { transaction: tx })

    const cPlain = contact.get({ plain: true }) as any
    await ActivityLog.create({
      propertyId,
      userId,
      userName,
      action: 'CONTACT_CONVERTED',
      detail: {
        description: `Converted ${cPlain.firstName} ${cPlain.lastName ?? ''} to Buyer`.trim(),
        buyerId: buyer.id,
        contactId,
      },
    } as any, { transaction: tx })

    const fresh = await Buyer.findByPk(buyer.id, {
      include: [{ model: Contact, as: 'contact' }],
      transaction: tx,
    })
    return fresh?.get({ plain: true })
  })

  return NextResponse.json({ success: true, data: result }, { status: 201 })
}
