import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const PatchSchema = z.object({
  dispoStage: z.enum(['POTENTIAL_BUYER', 'COLD_BUYER', 'WARM_BUYER', 'HOT_BUYER', 'DISPO_OFFER_RECEIVED', 'SOLD']).optional(),
  dispoOfferAmount: z.number().positive().optional(),
})

type Params = { params: Promise<{ id: string; matchId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny

  const { id: _propertyId, matchId } = await params
  const body = await req.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const updated = await prisma.buyerMatch.update({
    where: { id: matchId },
    data: {
      ...(parsed.data.dispoStage && { dispoStage: parsed.data.dispoStage }),
      ...(parsed.data.dispoOfferAmount != null && { dispoOfferAmount: parsed.data.dispoOfferAmount }),
    },
  })

  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny

  const { matchId } = await params
  await prisma.buyerMatch.delete({ where: { id: matchId } })
  return NextResponse.json({ success: true })
}
