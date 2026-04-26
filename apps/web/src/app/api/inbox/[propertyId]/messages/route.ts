import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getConversationMessages } from '@/lib/inbox'
import { Conversation } from '@crm/database'

type RouteParams = { params: Promise<{ propertyId: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { propertyId } = await params
  const messages = await getConversationMessages(propertyId)

  // Mark all conversations on this property as read (fire-and-forget).
  Conversation.update({ isRead: true }, { where: { propertyId } }).catch(() => {})

  return NextResponse.json({ messages })
}
