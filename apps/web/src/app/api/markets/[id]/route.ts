import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { Market } from '@crm/database'

const UpdateMarketSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  state: z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateMarketSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const market = await Market.findByPk(id)
  if (!market) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await market.update(parsed.data)
  return NextResponse.json(market)
}
