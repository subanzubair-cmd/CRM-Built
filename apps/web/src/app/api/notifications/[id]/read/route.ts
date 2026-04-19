import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  await prisma.notification.updateMany({
    where: { id, userId: ((session as any)?.user?.id ?? '') as string },
    data: { isRead: true, readAt: new Date() },
  })

  return new NextResponse(null, { status: 204 })
}
