import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

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

  const tasks = await prisma.task.findMany({
    where: {
      ...(propertyId ? { propertyId } : {}),
      ...(status ? { status } : {}),
    },
    include: { assignedTo: { select: { id: true, name: true } } },
    orderBy: { dueAt: 'asc' },
    take: 100,
  })

  return NextResponse.json({ data: tasks })
}
