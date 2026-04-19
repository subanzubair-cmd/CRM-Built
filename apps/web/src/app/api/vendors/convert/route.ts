import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
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

  // Check contact exists
  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  // Check if already a vendor
  const existing = await prisma.vendor.findUnique({ where: { contactId } })
  if (existing) return NextResponse.json({ error: 'Already a vendor' }, { status: 409 })

  // Create vendor record linked to existing contact
  const vendor = await prisma.vendor.create({
    data: {
      contactId,
      category,
      isActive: true,
    },
    include: { contact: true },
  })

  // Update contact type to VENDOR if not already
  await prisma.contact.update({
    where: { id: contactId },
    data: { type: 'VENDOR' },
  })

  // Create activity log on the property
  await prisma.activityLog.create({
    data: {
      propertyId,
      userId,
      userName,
      action: 'CONTACT_CONVERTED',
      detail: {
        description: `Converted ${contact.firstName} ${contact.lastName ?? ''} to Vendor (${category})`.trim(),
        vendorId: vendor.id,
        contactId,
      },
    },
  })

  return NextResponse.json({ success: true, data: vendor }, { status: 201 })
}
