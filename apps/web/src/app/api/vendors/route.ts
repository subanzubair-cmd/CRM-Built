import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Contact, Vendor, sequelize, Op } from '@crm/database'
import { z } from 'zod'

const CreateVendorSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  category: z.string().min(1).max(100),
  markets: z.array(z.string()).default([]),
  notes: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateVendorSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { firstName, lastName, email, phone, category, markets, notes } = parsed.data

  // Duplicate check on phone OR email among VENDOR-typed contacts.
  if (phone || email) {
    const duplicateContact = await Contact.findOne({
      where: {
        type: 'VENDOR',
        [Op.or]: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
    })
    if (duplicateContact) {
      const vendorProfile = await Vendor.findOne({
        where: { contactId: duplicateContact.id },
        attributes: ['id'],
      })
      return NextResponse.json(
        {
          error: `A vendor with this ${
            duplicateContact.phone === phone ? 'phone number' : 'email'
          } already exists: ${duplicateContact.firstName} ${duplicateContact.lastName ?? ''}`.trim(),
          existingVendorId: vendorProfile?.id,
        },
        { status: 409 },
      )
    }
  }

  // Two-step create wrapped in a transaction (Prisma's nested-create idiom
  // doesn't translate directly to Sequelize). Contact first, then Vendor
  // referencing its id.
  const vendor = await sequelize.transaction(async (t) => {
    const contact = await Contact.create(
      {
        type: 'VENDOR',
        firstName,
        lastName: lastName ?? null,
        email: email ?? null,
        phone: phone ?? null,
      },
      { transaction: t },
    )
    return Vendor.create(
      {
        contactId: contact.id,
        category,
        markets,
        notes: notes ?? null,
      },
      { transaction: t },
    )
  })

  // Re-read with eager-loaded contact so the response matches the previous
  // Prisma `include: { contact: true }` shape.
  const fresh = await Vendor.findByPk(vendor.id, {
    include: [{ model: Contact, as: 'contact' }],
  })
  return NextResponse.json({ success: true, data: fresh }, { status: 201 })
}
