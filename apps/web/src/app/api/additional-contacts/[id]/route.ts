import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { AdditionalContact } from '@crm/database'
import { z } from 'zod'
import { normalizePhone } from '@/lib/phone'

type Ctx = { params: Promise<{ id: string }> }

const UpdateSchema = z.object({
  relationship: z.string().min(1).max(100).optional(),
  firstName: z.string().min(1).max(200).optional(),
  lastName: z.string().max(200).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

/** GET /api/additional-contacts/:id */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const contact = await AdditionalContact.findByPk(id)
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ data: contact })
}

/** PATCH /api/additional-contacts/:id */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const contact = await AdditionalContact.findByPk(id)
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(', ') },
      { status: 422 },
    )
  }

  const data = parsed.data
  if (data.relationship !== undefined) contact.relationship = data.relationship
  if (data.firstName !== undefined) contact.firstName = data.firstName
  if (data.lastName !== undefined) contact.lastName = data.lastName ?? null
  if (data.phone !== undefined) contact.phone = normalizePhone(data.phone) ?? null
  if (data.email !== undefined) contact.email = data.email ?? null
  if (data.notes !== undefined) contact.notes = data.notes ?? null

  await contact.save()
  return NextResponse.json({ data: contact })
}

/** DELETE /api/additional-contacts/:id */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const contact = await AdditionalContact.findByPk(id)
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await contact.destroy()
  return NextResponse.json({ success: true })
}
