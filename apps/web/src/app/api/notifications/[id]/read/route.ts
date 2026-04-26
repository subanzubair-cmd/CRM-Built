import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Notification } from '@crm/database'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const userId = ((session as any)?.user?.id ?? '') as string

  await Notification.update(
    { isRead: true, readAt: new Date() },
    { where: { id, userId } },
  )

  return new NextResponse(null, { status: 204 })
}
