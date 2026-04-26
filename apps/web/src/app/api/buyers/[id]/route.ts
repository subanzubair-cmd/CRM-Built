import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { Buyer, Contact } from '@crm/database'
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

  const buyer = await Buyer.findByPk(id)
  if (!buyer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await buyer.update(parsed.data)
  const fresh = await Buyer.findByPk(id, {
    include: [{ model: Contact, as: 'contact', attributes: ['firstName', 'lastName'] }],
  })

  return NextResponse.json({ success: true, data: fresh?.get({ plain: true }) })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'contacts.edit')
  if (deny) return deny

  const { id } = await params
  await Buyer.update({ isActive: false }, { where: { id } })

  return NextResponse.json({ success: true })
}
