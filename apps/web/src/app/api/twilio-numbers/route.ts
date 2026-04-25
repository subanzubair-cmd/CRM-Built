// apps/web/src/app/api/twilio-numbers/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { TwilioNumber } from '@crm/database'

/**
 * GET /api/twilio-numbers
 * Returns all active Twilio numbers.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const numbers = await TwilioNumber.findAll({
    where: {
      isActive: true,
    },
    attributes: ['id', 'number', 'friendlyName', 'marketId'],
    order: [['friendlyName', 'ASC']],
  })

  return NextResponse.json({ data: numbers })
}
