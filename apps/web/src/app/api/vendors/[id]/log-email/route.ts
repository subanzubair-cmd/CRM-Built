import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { ActivityLog } from '@crm/database'
import { z } from 'zod'

const Schema = z.object({
  email: z.string().email(),
  subject: z.string().max(500).optional(),
  body: z.string().max(10000).optional(),
  // Legacy field — kept for backwards compatibility
  notes: z.string().max(2000).optional(),
  scheduledAt: z.string().optional(),
  timezone: z.string().optional(),
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

  const { email, subject, body, notes, scheduledAt, timezone } = parsed.data

  await ActivityLog.create({
    userId,
    action: scheduledAt ? 'EMAIL_SCHEDULED' : 'EMAIL_SENT',
    detail: {
      vendorId: id,
      email,
      subject: subject ?? null,
      body: body ?? notes ?? null,
      ...(scheduledAt ? { scheduledAt, timezone } : {}),
    },
  } as any)

  return NextResponse.json({ ok: true })
}
