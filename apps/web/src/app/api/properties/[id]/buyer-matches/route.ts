import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { BuyerMatch, Buyer, Contact, PipelineStageConfig } from '@crm/database'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const CreateSchema = z.object({
  buyerId: z.string().min(1),
  dispoStage: z.string().default('POTENTIAL_BUYER'),
})

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: propertyId } = await params
  const matches = await BuyerMatch.findAll({
    where: { propertyId },
    include: [
      {
        model: Buyer,
        as: 'buyer',
        include: [{ model: Contact, as: 'contact', attributes: ['firstName', 'lastName', 'phone', 'email'] }],
      },
    ],
    order: [['createdAt', 'DESC']],
  })

  const data = matches.map((m) => {
    const plain = m.get({ plain: true }) as any
    return {
      ...plain,
      score: Number(plain.score),
      dispoOfferAmount: plain.dispoOfferAmount ? Number(plain.dispoOfferAmount) : null,
    }
  })

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: propertyId } = await params
  const parsed = CreateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { buyerId, dispoStage } = parsed.data

  const existing = await BuyerMatch.findOne({ where: { propertyId, buyerId }, raw: true })
  if (existing) {
    // Look up buyer name + current stage label for a helpful error message
    const [buyerRow, stageRow] = await Promise.all([
      Buyer.findByPk(buyerId, {
        include: [{ model: Contact, as: 'contact', attributes: ['firstName', 'lastName'] }],
      }),
      PipelineStageConfig.findOne({
        where: { pipeline: 'dispo', stageCode: (existing as any).dispoStage },
        raw: true,
      }),
    ])
    const buyerName = buyerRow
      ? [
          (buyerRow as any).contact?.firstName ?? '',
          (buyerRow as any).contact?.lastName ?? '',
        ].join(' ').trim() || 'This buyer'
      : 'This buyer'
    const stageLabel = (stageRow as any)?.label ?? (existing as any).dispoStage ?? 'another stage'

    return NextResponse.json(
      { error: `${buyerName} is already in the "${stageLabel}" stage`, currentStage: (existing as any).dispoStage },
      { status: 409 },
    )
  }

  const match = await BuyerMatch.create({
    propertyId,
    buyerId,
    dispoStage,
    score: 0,
  } as any)

  return NextResponse.json({ success: true, data: match.get({ plain: true }) }, { status: 201 })
}
