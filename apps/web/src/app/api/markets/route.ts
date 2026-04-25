import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { Market } from '@crm/database'

const CreateMarketSchema = z.object({
  name: z.string().min(1),
  state: z.string().default('TX'),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const markets = await Market.findAll({
    where: { isActive: true },
    attributes: ['id', 'name'],
    order: [['name', 'ASC']],
  })

  return NextResponse.json(markets)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateMarketSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const market = await Market.create({ name: parsed.data.name, state: parsed.data.state })
  return NextResponse.json(market, { status: 201 })
}
