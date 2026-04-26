import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { Vendor, Contact } from '@crm/database'
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

  const vendor = await Vendor.findByPk(id, {
    include: [{ model: Contact, as: 'contact', attributes: ['firstName', 'lastName'] }],
  })
  if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await vendor.update(parsed.data)

  return NextResponse.json({ success: true, data: vendor })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'contacts.edit')
  if (deny) return deny

  const { id } = await params
  const vendor = await Vendor.findByPk(id)
  if (!vendor) return NextResponse.json({ success: true })
  await vendor.update({ isActive: false })

  return NextResponse.json({ success: true })
}
