import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { TwilioNumber } from '@crm/database'

type Params = { params: Promise<{ id: string }> }

const UpdateNumberSchema = z.object({
  friendlyName: z.string().optional(),
  purpose: z.enum(['leads', 'buyers', 'dialer', 'vendor', 'voice-ai', 'general', 'imessage']).optional(),
  marketId: z.string().optional().nullable(),
  spamStatus: z.string().optional().nullable(),
  tenDlcStatus: z.string().optional().nullable(),
  speedToLead: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateNumberSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const phoneNumber = await TwilioNumber.findByPk(id)
  if (!phoneNumber) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await phoneNumber.update(parsed.data)
  return NextResponse.json(phoneNumber)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const phoneNumber = await TwilioNumber.findByPk(id)
  if (!phoneNumber) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await phoneNumber.destroy()
  return NextResponse.json({ success: true })
}
