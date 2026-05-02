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
  from: z.string().optional(),
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

  const { phone, body, from, scheduledAt, timezone } = parsed.data

  // If scheduled, log the intent but don't send yet
  // (BullMQ scheduled worker picks these up — for now we log and send immediately
  //  since the buyer/vendor comm doesn't have a dedicated scheduler queue yet)
  const commConfig = await getActiveCommConfig()
  const fromNumber = from || commConfig?.defaultNumber
  if (!fromNumber) {
    return NextResponse.json(
      { error: 'No outbound number configured in Settings → SMS & Phone.' },
      { status: 422 },
    )
  }

  if (!scheduledAt) {
    // Send immediately
    try {
      await sendSms({ from: fromNumber, to: phone, text: body })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'SMS send failed' },
        { status: 502 },
      )
    }
  }
  // If scheduledAt is provided, we skip immediate send and just log (scheduled send TBD)

  await ActivityLog.create({
    userId,
    action: scheduledAt ? 'SMS_SCHEDULED' : 'SMS_SENT',
    detail: {
      buyerId: id,
      to: phone,
      from: fromNumber,
      body,
      ...(scheduledAt ? { scheduledAt, timezone } : {}),
    },
  } as any)

  return NextResponse.json({ ok: true })
}
