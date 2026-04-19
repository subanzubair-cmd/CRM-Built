import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { updatePropertyContact, removeContactFromProperty } from '@/lib/contacts'

const UpdateContactSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  contactType: z.enum(['SELLER', 'BUYER', 'AGENT', 'VENDOR', 'OTHER']).optional(),
  role: z.string().max(50).nullable().optional(),
  isPrimary: z.boolean().optional(),
  doNotCall: z.boolean().optional(),
  doNotText: z.boolean().optional(),
  preferredChannel: z.string().max(20).nullable().optional(),
})

type Params = { params: Promise<{ id: string; contactId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, contactId } = await params
  const body = await req.json()
  const parsed = UpdateContactSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    await updatePropertyContact(id, contactId, parsed.data)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[contacts] update error:', err)
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, contactId } = await params

  try {
    await removeContactFromProperty(id, contactId)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[contacts] remove error:', err)
    return NextResponse.json({ error: 'Failed to remove contact' }, { status: 500 })
  }
}
