import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getConversationContext } from '@/lib/inbox'

type RouteParams = { params: Promise<{ propertyId: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { propertyId } = await params
  const context = await getConversationContext(propertyId)

  if (!context) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  return NextResponse.json({ context })
}
