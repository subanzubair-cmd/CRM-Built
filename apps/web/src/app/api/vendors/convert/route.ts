import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Contact, Vendor, ActivityLog, sequelize } from '@crm/database'
import { z } from 'zod'

const ConvertToVendorSchema = z.object({
  contactId: z.string().min(1),
  propertyId: z.string().min(1),
  category: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionUser = (session as any)?.user ?? {}
  const userId = sessionUser.id as string
  const userName = (sessionUser.name ?? 'Unknown') as string

  const body = await req.json()
  const parsed = ConvertToVendorSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { contactId, propertyId, category } = parsed.data

  const contact = await Contact.findByPk(contactId)
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const existing = await Vendor.findOne({ where: { contactId } })
  if (existing) return NextResponse.json({ error: 'Already a vendor' }, { status: 409 })

  const result = await sequelize.transaction(async (tx) => {
    const vendor = await Vendor.create({
      contactId,
      category,
      isActive: true,
    } as any, { transaction: tx })

    await contact.update({ type: 'VENDOR' }, { transaction: tx })

    const cPlain = contact.get({ plain: true }) as any
    await ActivityLog.create({
      propertyId,
      userId,
      userName,
      action: 'CONTACT_CONVERTED',
      detail: {
        description: `Converted ${cPlain.firstName} ${cPlain.lastName ?? ''} to Vendor (${category})`.trim(),
        vendorId: vendor.id,
        contactId,
      },
    } as any, { transaction: tx })

    const fresh = await Vendor.findByPk(vendor.id, {
      include: [{ model: Contact, as: 'contact' }],
      transaction: tx,
    })
    return fresh?.get({ plain: true })
  })

  return NextResponse.json({ success: true, data: result }, { status: 201 })
}
