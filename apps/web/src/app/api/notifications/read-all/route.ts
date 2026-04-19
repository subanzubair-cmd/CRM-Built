import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.notification.updateMany({
    where: { userId: ((session as any)?.user?.id ?? '') as string, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })

  return new NextResponse(null, { status: 204 })
}
