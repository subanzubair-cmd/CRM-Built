import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Contact, Vendor, sequelize, Op, literal } from '@crm/database'
import { z } from 'zod'

function escapeLiteral(v: string): string {
  return `'${String(v).replace(/'/g, "''")}'`
}

const CreateVendorSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  category: z.string().min(1).max(100),
  markets: z.array(z.string()).default([]),
  howHeardAbout: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateVendorSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { firstName, lastName, email, phone, category, markets, howHeardAbout, notes } = parsed.data

  // REQUIRED: at least one of phone OR email. Vendors aren't worth
  // recording without a contact channel.
  if (!phone && !email) {
    return NextResponse.json(
      { error: 'Provide at least one phone number or email.' },
      { status: 422 },
    )
  }

  // Duplicate scan over BOTH legacy columns AND the JSONB phones/
  // emails arrays so a vendor authored via either form path is
  // matched.
  const phoneDigits = phone ? phone.replace(/\D/g, '') : ''
  const dupClauses = [
    ...(phone ? [literal(`"phone" = ${escapeLiteral(phone)}`)] : []),
    ...(phoneDigits.length >= 7
      ? [literal(`"phones"::text ILIKE ${escapeLiteral(`%${phoneDigits}%`)}`)]
      : []),
    ...(email ? [literal(`LOWER("email") = LOWER(${escapeLiteral(email)})`)] : []),
    ...(email ? [literal(`"emails"::text ILIKE ${escapeLiteral(`%${email}%`)}`)] : []),
  ]
  if (dupClauses.length > 0) {
    const duplicateContact = await Contact.findOne({
      where: { type: 'VENDOR', [Op.or]: dupClauses as any },
    })
    if (duplicateContact) {
      const vendorProfile = await Vendor.findOne({
        where: { contactId: duplicateContact.id },
        attributes: ['id'],
      })
      return NextResponse.json(
        {
          error: `A vendor with this phone number / email already exists: ${[duplicateContact.firstName, duplicateContact.lastName].filter(Boolean).join(' ')}`,
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
        phones: phone ? [{ label: 'Mobile', number: phone }] : [],
        emails: email ? [{ label: 'Primary', email }] : [],
        howHeardAbout: howHeardAbout ?? null,
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
