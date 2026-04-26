import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { SavedFilter } from '@crm/database'

type Params = { params: Promise<{ id: string }> }

// DELETE /api/saved-filters/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params

  const filter = await SavedFilter.findOne({ where: { id, userId } })
  if (!filter) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await filter.destroy()
  return NextResponse.json({ success: true })
}
