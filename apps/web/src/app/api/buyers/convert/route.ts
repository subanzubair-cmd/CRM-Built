import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
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

  // Check contact exists
  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  // Check if already a buyer
  const existing = await prisma.buyer.findUnique({ where: { contactId } })
  if (existing) return NextResponse.json({ error: 'Already a buyer' }, { status: 409 })

  // Create buyer record linked to existing contact
  const buyer = await prisma.buyer.create({
    data: {
      contactId,
      isActive: true,
      preferredMarkets,
    },
    include: { contact: true },
  })

  // Update contact type to BUYER if not already
  await prisma.contact.update({
    where: { id: contactId },
    data: { type: 'BUYER' },
  })

  // Create activity log on the property
  await prisma.activityLog.create({
    data: {
      propertyId,
      userId,
      userName,
      action: 'CONTACT_CONVERTED',
      detail: {
        description: `Converted ${contact.firstName} ${contact.lastName ?? ''} to Buyer`.trim(),
        buyerId: buyer.id,
        contactId,
      },
    },
  })

  return NextResponse.json({ success: true, data: buyer }, { status: 201 })
}
