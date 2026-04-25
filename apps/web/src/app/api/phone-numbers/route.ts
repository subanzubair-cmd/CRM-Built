import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { TwilioNumber } from '@crm/database'

const CreateNumberSchema = z.object({
  number: z.string().min(1),
  friendlyName: z.string().optional(),
  purpose: z.enum(['leads', 'buyers', 'dialer', 'vendor', 'voice-ai', 'general', 'imessage']).default('general'),
  marketId: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const purpose = searchParams.get('purpose')

  const where: Record<string, unknown> = {}
  if (purpose) where.purpose = purpose

  const numbers = await TwilioNumber.findAll({
    where,
    order: [['createdAt', 'DESC']],
  })

  return NextResponse.json({ data: numbers })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateNumberSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const phoneNumber = await TwilioNumber.create(parsed.data)
  return NextResponse.json(phoneNumber, { status: 201 })
}
