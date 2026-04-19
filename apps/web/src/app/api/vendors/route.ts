import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
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

  // Check for duplicate vendor by phone or email
  if (phone || email) {
    const duplicateContact = await prisma.contact.findFirst({
      where: {
        type: 'VENDOR',
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
    })
    if (duplicateContact) {
      const vendorProfile = await prisma.vendor.findFirst({ where: { contactId: duplicateContact.id }, select: { id: true } })
      return NextResponse.json({
        error: `A vendor with this ${duplicateContact.phone === phone ? 'phone number' : 'email'} already exists: ${duplicateContact.firstName} ${duplicateContact.lastName ?? ''}`.trim(),
        existingVendorId: vendorProfile?.id,
      }, { status: 409 })
    }
  }

  const vendor = await prisma.vendor.create({
    data: {
      category,
      markets,
      notes,
      contact: {
        create: {
          type: 'VENDOR',
          firstName,
          lastName,
          email,
          phone,
        },
      },
    },
    include: { contact: true },
  })

  return NextResponse.json({ success: true, data: vendor }, { status: 201 })
}
