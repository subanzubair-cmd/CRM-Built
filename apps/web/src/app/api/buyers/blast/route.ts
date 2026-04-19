import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const BlastSchema = z.object({
  channel: z.enum(['SMS', 'EMAIL']),
  subject: z.string().optional(),
  body: z.string().min(1).max(1600),
  // Optional: restrict to specific buyer IDs (checkbox selection)
  // If omitted, blasts to ALL active buyers (legacy header button behavior)
  buyerIds: z.array(z.string()).min(1).max(500).optional(),
  marketFilter: z.string().optional(), // market name to restrict recipients (used when buyerIds not set)
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const json = await req.json()
  const parsed = BlastSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { channel, subject, body: messageBody, buyerIds, marketFilter } = parsed.data

  // Fetch target buyers with contacts
  const buyers = await prisma.buyer.findMany({
    where: {
      isActive: true,
      ...(buyerIds && buyerIds.length > 0
        ? { id: { in: buyerIds } }
        : marketFilter
          ? { preferredMarkets: { has: marketFilter } }
          : {}),
    },
    include: {
      contact: { select: { id: true, phone: true, email: true, firstName: true } },
    },
    take: 500,
  })

  // Filter buyers who have the right contact info for the channel
  const eligible = buyers.filter((b) =>
    channel === 'SMS' ? Boolean(b.contact.phone) : Boolean(b.contact.email)
  )

  if (eligible.length === 0) {
    return NextResponse.json({ error: 'No eligible buyers for this channel' }, { status: 400 })
  }

  const userId = ((session as any)?.user?.id ?? '') as string

  const created = await prisma.$transaction(
    eligible.map((b) =>
      prisma.message.create({
        data: {
          channel: channel as any,
          direction: 'OUTBOUND',
          body: messageBody,
          subject: subject ?? null,
          sentById: userId,
          to: channel === 'SMS' ? b.contact.phone : b.contact.email,
          // propertyId intentionally omitted — buyer blasts are contact-level communications
        },
      })
    )
  )

  return NextResponse.json({
    sent: created.length,
    total: eligible.length,
    channel,
  })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Return count of active buyers by channel eligibility
  const [smsEligible, emailEligible] = await Promise.all([
    prisma.buyer.count({ where: { isActive: true, contact: { phone: { not: null } } } }),
    prisma.buyer.count({ where: { isActive: true, contact: { email: { not: null } } } }),
  ])

  return NextResponse.json({ smsEligible, emailEligible })
}
