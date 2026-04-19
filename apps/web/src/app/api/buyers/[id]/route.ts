import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const UpdateBuyerSchema = z.object({
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  preferredMarkets: z.array(z.string()).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'contacts.edit')
  if (deny) return deny

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateBuyerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const buyer = await prisma.buyer.update({
    where: { id },
    data: parsed.data,
    include: { contact: { select: { firstName: true, lastName: true } } },
  })

  return NextResponse.json({ success: true, data: buyer })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'contacts.edit')
  if (deny) return deny

  const { id } = await params
  await prisma.buyer.update({
    where: { id },
    data: { isActive: false },
  })

  return NextResponse.json({ success: true })
}
