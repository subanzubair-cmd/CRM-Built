import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { runBuyerMatching } from '@/lib/buyer-matching'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const count = await runBuyerMatching(id)
    return NextResponse.json({ matched: count })
  } catch {
    return NextResponse.json({ error: 'Matching failed' }, { status: 500 })
  }
}
