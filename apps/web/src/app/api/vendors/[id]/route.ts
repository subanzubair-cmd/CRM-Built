import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { Vendor, Contact } from '@crm/database'
import { z } from 'zod'

/**
 * Vendor PATCH accepts both Vendor-level fields (isActive, category,
 * markets, notes) AND Contact-level fields (firstName, lastName,
 * phone, email). The route splits them by destination so the form
 * can update everything in a single request.
 */
const UpdateVendorSchema = z.object({
  // Vendor-level
  isActive: z.boolean().optional(),
  category: z.string().min(1).max(100).optional(),
  markets: z.array(z.string()).optional(),
  notes: z.string().max(2000).nullable().optional(),
  // Contact-level (mirrored to the joined Contact row)
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().nullable().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const vendor = await Vendor.findByPk(id, {
    include: [{ model: Contact, as: 'contact' }],
  })
  if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data: vendor.get({ plain: true }) })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'contacts.edit')
  if (deny) return deny

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateVendorSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  const data = parsed.data

  const vendor = await Vendor.findByPk(id, {
    include: [{ model: Contact, as: 'contact' }],
  })
  if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Apply Vendor + Contact patches separately. Vendor-level keys
  // first; then if any Contact-level keys arrived, push those to
  // the joined Contact row.
  const vendorPatch: Record<string, unknown> = {}
  for (const key of ['isActive', 'category', 'markets', 'notes'] as const) {
    if (key in data) (vendorPatch as any)[key] = (data as any)[key]
  }
  if (Object.keys(vendorPatch).length > 0) {
    await vendor.update(vendorPatch as any)
  }

  const contactPatch: Record<string, unknown> = {}
  if (data.firstName !== undefined) contactPatch.firstName = data.firstName
  if (data.lastName !== undefined) contactPatch.lastName = data.lastName
  if (data.phone !== undefined) contactPatch.phone = data.phone
  if (data.email !== undefined) contactPatch.email = data.email
  if (Object.keys(contactPatch).length > 0) {
    await Contact.update(contactPatch as any, { where: { id: vendor.contactId } } as any)
  }

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
