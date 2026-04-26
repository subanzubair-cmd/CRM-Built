import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { addContactToProperty } from '@/lib/contacts'
import { toE164 } from '@crm/shared'

const AddContactSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  contactType: z.enum(['SELLER', 'BUYER', 'AGENT', 'VENDOR', 'OTHER']).default('SELLER'),
  role: z.string().max(50).nullable().optional(),
  isPrimary: z.boolean().default(false),
  preferredChannel: z.string().max(20).nullable().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = AddContactSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  // Normalize phone to E.164 so it round-trips with inbound webhooks.
  const normalized = {
    ...parsed.data,
    phone: parsed.data.phone ? (toE164(parsed.data.phone) ?? parsed.data.phone) : parsed.data.phone,
  }

  try {
    const result = await addContactToProperty(id, normalized)
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err) {
    console.error('[contacts] add error:', err)
    return NextResponse.json({ error: 'Failed to add contact' }, { status: 500 })
  }
}
