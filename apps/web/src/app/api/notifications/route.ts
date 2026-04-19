import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUnreadNotifications } from '@/lib/notifications'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notifications = await getUnreadNotifications(((session as any)?.user?.id ?? '') as string)
  return NextResponse.json(notifications)
}
