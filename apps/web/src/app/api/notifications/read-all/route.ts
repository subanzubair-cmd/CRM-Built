import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Notification } from '@crm/database'

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = ((session as any)?.user?.id ?? '') as string
  await Notification.update(
    { isRead: true, readAt: new Date() },
    { where: { userId, isRead: false } },
  )

  return new NextResponse(null, { status: 204 })
}
