import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Property } from '@crm/database'
import { generateLeadSummary } from '@/lib/lead-summary'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const summary = await generateLeadSummary(id)

    await Property.update({ aiSummary: summary } as any, { where: { id } })

    return NextResponse.json({ summary })
  } catch (err) {
    console.error('[summarize] error:', err)
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
  }
}
