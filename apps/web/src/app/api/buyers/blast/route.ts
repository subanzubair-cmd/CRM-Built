import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Buyer, Contact, Message, Op, literal, sequelize } from '@crm/database'
import { z } from 'zod'

const BlastSchema = z.object({
  channel: z.enum(['SMS', 'EMAIL']),
  subject: z.string().optional(),
  body: z.string().min(1).max(1600),
  buyerIds: z.array(z.string()).min(1).max(500).optional(),
  marketFilter: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const json = await req.json()
  const parsed = BlastSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { channel, subject, body: messageBody, buyerIds, marketFilter } = parsed.data

  const where: Record<string, unknown> = { isActive: true }
  if (buyerIds && buyerIds.length > 0) {
    where.id = { [Op.in]: buyerIds }
  } else if (marketFilter) {
    const escaped = marketFilter.replace(/'/g, "''")
    where.id = {
      [Op.in]: literal(`(SELECT id FROM "Buyer" WHERE "preferredMarkets" @> ARRAY['${escaped}']::text[])`),
    }
  }

  const buyers = await Buyer.findAll({
    where,
    include: [
      {
        model: Contact,
        as: 'contact',
        attributes: ['id', 'phone', 'email', 'firstName'],
        required: true,
      },
    ],
    limit: 500,
  })

  const eligible = buyers
    .map((b) => b.get({ plain: true }) as any)
    .filter((b) =>
      channel === 'SMS' ? Boolean(b.contact?.phone) : Boolean(b.contact?.email),
    )

  if (eligible.length === 0) {
    return NextResponse.json({ error: 'No eligible buyers for this channel' }, { status: 400 })
  }

  const userId = ((session as any)?.user?.id ?? '') as string

  const created = await sequelize.transaction(async (tx) =>
    Message.bulkCreate(
      eligible.map((b) => ({
        channel,
        direction: 'OUTBOUND',
        body: messageBody,
        subject: subject ?? null,
        sentById: userId,
        to: channel === 'SMS' ? b.contact.phone : b.contact.email,
      })) as any[],
      { transaction: tx },
    ),
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

  const [smsEligible, emailEligible] = await Promise.all([
    Buyer.count({
      where: { isActive: true },
      include: [{ model: Contact, as: 'contact', where: { phone: { [Op.ne]: null } }, required: true, attributes: [] }],
    }),
    Buyer.count({
      where: { isActive: true },
      include: [{ model: Contact, as: 'contact', where: { email: { [Op.ne]: null } }, required: true, attributes: [] }],
    }),
  ])

  return NextResponse.json({ smsEligible, emailEligible })
}
