import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { User } from '@crm/database'
import { normalizePhone } from '@/lib/phone'

const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  notificationPrefs: z.record(z.unknown()).optional(),
})

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const id = ((session as any)?.user?.id ?? '') as string
  const user = await User.findByPk(id)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const updateData = {
    ...parsed.data,
    ...(parsed.data.phone !== undefined ? { phone: normalizePhone(parsed.data.phone) ?? undefined } : {}),
  }
  await user.update(updateData as any)
  return NextResponse.json({
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
  })
}
