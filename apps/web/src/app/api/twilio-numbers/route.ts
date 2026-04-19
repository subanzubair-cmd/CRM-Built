// apps/web/src/app/api/twilio-numbers/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/twilio-numbers
 * Returns all active Twilio numbers.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const numbers = await prisma.twilioNumber.findMany({
    where: {
      isActive: true,
    },
    select: { id: true, number: true, friendlyName: true, marketId: true },
    orderBy: { friendlyName: 'asc' },
  })

  return NextResponse.json({ data: numbers })
}
