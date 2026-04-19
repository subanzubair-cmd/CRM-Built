import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getConversationMessages } from '@/lib/inbox'
import { prisma } from '@/lib/prisma'

type RouteParams = { params: Promise<{ propertyId: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { propertyId } = await params
  const messages = await getConversationMessages(propertyId)

  // Mark as read
  prisma.conversation
    .updateMany({ where: { propertyId }, data: { isRead: true } })
    .catch(() => {})

  return NextResponse.json({ messages })
}
