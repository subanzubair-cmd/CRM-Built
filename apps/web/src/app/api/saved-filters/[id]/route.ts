import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

// DELETE /api/saved-filters/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params

  const filter = await prisma.savedFilter.findFirst({ where: { id, userId } })
  if (!filter) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.savedFilter.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
