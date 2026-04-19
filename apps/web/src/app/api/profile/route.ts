import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

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

  const user = await prisma.user.update({
    where: { id: ((session as any)?.user?.id ?? '') as string },
    data: parsed.data as any,
    select: { id: true, name: true, phone: true, email: true },
  })

  return NextResponse.json(user)
}
