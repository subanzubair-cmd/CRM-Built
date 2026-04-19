import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getMarketScope } from '@/lib/auth-utils'
import { z } from 'zod'

const CreateBuyerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
  preferredMarkets: z.array(z.string()).default([]),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const search = req.nextUrl.searchParams.get('search') ?? ''
  const scope = getMarketScope(session)

  const filters: Record<string, unknown>[] = []
  if (search.length >= 2) {
    filters.push({
      contact: {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search } },
        ],
      },
    })
  }
  if (scope !== null) {
    // Non-admin: buyer must overlap with user's assigned markets
    filters.push({ preferredMarkets: { hasSome: scope } })
  }
  const where = filters.length ? { AND: filters } : {}

  const buyers = await prisma.buyer.findMany({
    where,
    include: { contact: { select: { firstName: true, lastName: true, phone: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json({ data: buyers })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateBuyerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { firstName, lastName, email, phone, notes, preferredMarkets } = parsed.data

  // Check for duplicate buyer by phone or email
  if (phone || email) {
    const duplicateContact = await prisma.contact.findFirst({
      where: {
        type: 'BUYER',
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      include: { buyerProfile: { select: { id: true } } },
    })
    if (duplicateContact) {
      return NextResponse.json({
        error: `A buyer with this ${duplicateContact.phone === phone ? 'phone number' : 'email'} already exists: ${duplicateContact.firstName} ${duplicateContact.lastName ?? ''}`.trim(),
        existingBuyerId: duplicateContact.buyerProfile?.id,
      }, { status: 409 })
    }
  }

  const buyer = await prisma.buyer.create({
    data: {
      preferredMarkets,
      notes,
      contact: {
        create: {
          type: 'BUYER',
          firstName,
          lastName,
          email,
          phone,
        },
      },
    },
    include: { contact: true },
  })

  return NextResponse.json({ success: true, data: buyer }, { status: 201 })
}
