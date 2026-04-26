import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { FinancialGoal } from '@crm/database'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string
  const { id } = await params

  const goal = await FinancialGoal.findByPk(id)
  if (!goal || goal.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await goal.destroy()
  return NextResponse.json({ ok: true })
}
