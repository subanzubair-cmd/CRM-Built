import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Task, User } from '@crm/database'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const propertyId = sp.get('propertyId') ?? undefined
  const statusParam = sp.get('status')?.toUpperCase() ?? undefined
  const ALLOWED_STATUSES = ['PENDING', 'COMPLETED', 'CANCELLED'] as const
  type TaskStatus = typeof ALLOWED_STATUSES[number]
  const status = statusParam && ALLOWED_STATUSES.includes(statusParam as TaskStatus)
    ? (statusParam as TaskStatus)
    : undefined

  const where: Record<string, unknown> = {}
  if (propertyId) where.propertyId = propertyId
  if (status) where.status = status

  const tasks = await Task.findAll({
    where,
    include: [{ model: User, as: 'assignedTo', attributes: ['id', 'name'] }],
    order: [['dueAt', 'ASC']],
    limit: 100,
    raw: true,
    nest: true,
  })

  return NextResponse.json({ data: tasks })
}
