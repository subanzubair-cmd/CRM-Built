import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { ActivityLog } from '@crm/database'
import { z } from 'zod'
import { sendSms } from '@/lib/sms-send'
import { getActiveCommConfig } from '@/lib/comm-provider'

const Schema = z.object({
  phone: z.string().min(1),
  body: z.string().min(1).max(1600),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.send')
  if (deny) return deny
  const userId = (session as any)?.user?.id ?? ''

  const { id } = await params
  const rawBody = await req.json()
  const parsed = Schema.safeParse(rawBody)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const commConfig = await getActiveCommConfig()
  const fromNumber = commConfig?.defaultNumber
  if (!fromNumber) {
    return NextResponse.json(
      { error: 'No outbound number configured in Settings → SMS & Phone.' },
      { status: 422 },
    )
  }

  try {
    await sendSms({ from: fromNumber, to: parsed.data.phone, text: parsed.data.body })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'SMS send failed' },
      { status: 502 },
    )
  }

  await ActivityLog.create({
    userId,
    action: 'SMS_SENT',
    detail: { vendorId: id, to: parsed.data.phone, body: parsed.data.body },
  })

  return NextResponse.json({ ok: true })
}
