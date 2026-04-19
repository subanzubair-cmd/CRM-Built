import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string
  const { id } = await params

  const goal = await (prisma as any).financialGoal.findUnique({ where: { id } })
  if (!goal || goal.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await (prisma as any).financialGoal.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
