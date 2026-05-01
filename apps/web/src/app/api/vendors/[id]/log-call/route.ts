import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { ActivityLog } from '@crm/database'
import { z } from 'zod'

const Schema = z.object({
  phone: z.string().min(1),
  outcome: z.enum(['CONNECTED', 'NOT_CONNECTED', 'LEFT_VOICEMAIL']),
  durationMinutes: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.send')
  if (deny) return deny
  const userId = (session as any)?.user?.id ?? ''

  const { id } = await params
  const rawBody = await req.json()
  const parsed = Schema.safeParse(rawBody)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 422 })

  const { phone, outcome, durationMinutes, notes } = parsed.data

  await ActivityLog.create({
    userId,
    action: 'CALL_LOGGED',
    detail: { vendorId: id, phone, outcome, durationMinutes, notes },
  })

  return NextResponse.json({ ok: true })
}
