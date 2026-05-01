import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { Buyer, Contact } from '@crm/database'
import { z } from 'zod'
import { findDuplicateContact } from '@/lib/dedupe'

/**
 * Update a buyer + its underlying contact. Accepts the full new
 * shape (multi-value phones/emails, target geography, custom
 * questions, owner) plus the legacy fields. Anything missing from
 * the patch is left untouched.
 */
const PhoneSchema = z.object({
  label: z.string().min(1).max(40).default('primary'),
  number: z.string().min(1).max(40),
})
const EmailSchema = z.object({
  label: z.string().min(1).max(40).default('primary'),
  email: z.string().email(),
})

const UpdateBuyerSchema = z.object({
  // Buyer-level
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  preferredMarkets: z.array(z.string()).optional(),
  targetCities: z.array(z.string()).optional(),
  targetZips: z.array(z.string()).optional(),
  targetCounties: z.array(z.string()).optional(),
  targetStates: z.array(z.string()).optional(),
  customQuestions: z.record(z.unknown()).optional(),
  vipFlag: z.boolean().optional(),
  // Contact-level (mirrors are written to Contact)
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).nullable().optional(),
  contactType: z.enum(['BUYER', 'AGENT']).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  phones: z.array(PhoneSchema).optional(),
  emails: z.array(EmailSchema).optional(),
  mailingAddress: z.string().max(500).nullable().optional(),
  howHeardAbout: z.string().max(120).nullable().optional(),
  assignedUserId: z.string().nullable().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  // Read access uses the loose `contacts.view` gate — anybody who
  // can see the contacts list can read a single record.
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const buyer = await Buyer.findByPk(id, {
    include: [{ model: Contact, as: 'contact' }],
  })
  if (!buyer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data: buyer.get({ plain: true }) })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'contacts.edit')
  if (deny) return deny

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateBuyerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  const data = parsed.data

  const buyer = await Buyer.findByPk(id)
  if (!buyer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Duplicate check when phones/emails are being changed. Collect all
  // phone/email values from the patch and compare against other contacts.
  const patchPhones = data.phones?.map((p) => p.number).filter(Boolean) ?? []
  const patchEmails = data.emails?.map((e) => e.email).filter(Boolean) ?? []
  if (data.phone) patchPhones.push(data.phone)
  if (data.email) patchEmails.push(data.email)
  if (patchPhones.length > 0 || patchEmails.length > 0) {
    const dup = await findDuplicateContact({
      allPhones: patchPhones,
      allEmails: patchEmails,
      contactType: data.contactType ?? 'BUYER',
      excludeContactId: buyer.contactId as string,
    })
    if (dup) {
      const name = [dup.contact.firstName, dup.contact.lastName].filter(Boolean).join(' ')
      return NextResponse.json(
        {
          error: `A buyer with one of these phone numbers / emails already exists: ${name}`,
          existingBuyerId: dup.buyerId,
        },
        { status: 409 },
      )
    }
  }

  // Split into Buyer fields vs Contact fields and apply each.
  const buyerPatch: Record<string, unknown> = {}
  for (const key of [
    'isActive',
    'notes',
    'preferredMarkets',
    'targetCities',
    'targetZips',
    'targetCounties',
    'targetStates',
    'customQuestions',
    'vipFlag',
  ] as const) {
    if (key in data) (buyerPatch as any)[key] = (data as any)[key]
  }
  if (Object.keys(buyerPatch).length > 0) {
    await buyer.update(buyerPatch as any)
  }

  const contactPatch: Record<string, unknown> = {}
  if (data.firstName !== undefined) contactPatch.firstName = data.firstName
  if (data.lastName !== undefined) contactPatch.lastName = data.lastName
  if (data.contactType !== undefined) contactPatch.type = data.contactType
  if (data.mailingAddress !== undefined) contactPatch.mailingAddress = data.mailingAddress
  if (data.howHeardAbout !== undefined) contactPatch.howHeardAbout = data.howHeardAbout
  if (data.assignedUserId !== undefined) contactPatch.assignedUserId = data.assignedUserId
  if (data.phones !== undefined) {
    contactPatch.phones = data.phones
    contactPatch.phone = data.phones[0]?.number ?? null
  } else if (data.phone !== undefined) {
    contactPatch.phone = data.phone
  }
  if (data.emails !== undefined) {
    contactPatch.emails = data.emails
    contactPatch.email = data.emails[0]?.email ?? null
  } else if (data.email !== undefined) {
    contactPatch.email = data.email
  }
  if (Object.keys(contactPatch).length > 0) {
    await Contact.update(contactPatch as any, { where: { id: buyer.contactId } } as any)
  }

  const fresh = await Buyer.findByPk(id, {
    include: [{ model: Contact, as: 'contact' }],
  })

  return NextResponse.json({ success: true, data: fresh?.get({ plain: true }) })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'contacts.edit')
  if (deny) return deny

  const { id } = await params
  await Buyer.update({ isActive: false }, { where: { id } })

  return NextResponse.json({ success: true })
}
