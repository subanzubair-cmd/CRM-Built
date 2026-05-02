import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Contact, Vendor, Op, literal } from '@crm/database'
import { z } from 'zod'
import { normalizePhone } from '@/lib/phone'

function escapeLiteral(v: string): string {
  return `'${String(v).replace(/'/g, "''")}'`
}

const CreateVendorSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).nullish(),
  email: z.string().email().nullish(),
  phone: z.string().max(20).nullish(),
  category: z.string().min(1).max(100),
  markets: z.array(z.string()).default([]),
  howHeardAbout: z.string().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateVendorSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { firstName, lastName, email, category, markets, howHeardAbout, notes } = parsed.data
  const phone = normalizePhone(parsed.data.phone) ?? parsed.data.phone

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

  // Two-step create: Contact first, then Vendor referencing its id.
  // Matches the buyer creation pattern (sequential, no explicit transaction
  // wrapper) which is proven to work reliably with this Sequelize setup.
  let contact: InstanceType<typeof Contact>
  let vendorRow: InstanceType<typeof Vendor>
  try {
    contact = await Contact.create({
      type: 'VENDOR',
      firstName,
      lastName: lastName ?? null,
      email: email ?? null,
      phone: phone ?? null,
      phones: phone ? [{ label: 'Mobile', number: phone }] : [],
      emails: email ? [{ label: 'Primary', email }] : [],
      howHeardAbout: howHeardAbout ?? null,
    } as any)
  } catch (err: any) {
    console.error('[POST /api/vendors] Contact.create failed:', err?.message)
    return NextResponse.json(
      { error: err?.original?.message ?? err?.message ?? 'Failed to create contact' },
      { status: 500 },
    )
  }

  try {
    vendorRow = await Vendor.create({
      contactId: contact.id,
      category,
      markets,
      notes: notes ?? null,
    } as any)
  } catch (err: any) {
    // Rollback the contact if vendor creation fails so we don't leave orphans.
    await contact.destroy().catch(() => {})
    console.error('[POST /api/vendors] Vendor.create failed:', err?.message)
    return NextResponse.json(
      { error: err?.original?.message ?? err?.message ?? 'Failed to create vendor' },
      { status: 500 },
    )
  }

  // Re-read with eager-loaded contact so the response matches the previous
  // Prisma `include: { contact: true }` shape.
  const fresh = await Vendor.findByPk(vendorRow.id, {
    include: [{ model: Contact, as: 'contact' }],
  })
  return NextResponse.json({ success: true, data: fresh }, { status: 201 })
}
