import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

type Params = { params: Promise<{ id: string; offerId: string }> }

const UpdateSchema = z.object({
  offerBy: z.enum(['OUR_OFFER', 'SELLER_OFFER']).optional(),
  offerDate: z.string().optional(),
  offerType: z.enum(['VERBAL', 'WRITTEN']).optional(),
  offerPrice: z.number().positive().optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { offerId } = await params
  const parsed = UpdateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const data: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.offerDate) {
    const d = parsed.data.offerDate
    data.offerDate = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00') : new Date(d)
  }

  const offer = await prisma.leadOffer.update({ where: { id: offerId }, data })
  return NextResponse.json({ success: true, data: { ...offer, offerPrice: Number(offer.offerPrice) } })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { offerId } = await params
  await prisma.leadOffer.delete({ where: { id: offerId } })
  return NextResponse.json({ success: true })
}
