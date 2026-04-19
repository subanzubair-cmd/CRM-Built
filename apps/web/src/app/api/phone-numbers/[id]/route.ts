import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

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

  const phoneNumber = await prisma.twilioNumber.update({ where: { id }, data: parsed.data })
  return NextResponse.json(phoneNumber)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  await prisma.twilioNumber.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
