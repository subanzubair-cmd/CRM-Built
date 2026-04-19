import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const UpdateVendorSchema = z.object({
  isActive: z.boolean().optional(),
  category: z.string().min(1).max(100).optional(),
  markets: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'contacts.edit')
  if (deny) return deny

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateVendorSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const vendor = await prisma.vendor.update({
    where: { id },
    data: parsed.data,
    include: { contact: { select: { firstName: true, lastName: true } } },
  })

  return NextResponse.json({ success: true, data: vendor })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'contacts.edit')
  if (deny) return deny

  const { id } = await params
  await prisma.vendor.update({
    where: { id },
    data: { isActive: false },
  })

  return NextResponse.json({ success: true })
}
