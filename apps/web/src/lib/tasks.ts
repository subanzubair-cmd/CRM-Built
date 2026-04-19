import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export interface TaskListFilter {
  assignedToId?: string
  propertyId?: string
  overdue?: boolean
  dueToday?: boolean
  page?: number
  pageSize?: number
}

export async function getTaskList(filter: TaskListFilter) {
  const { assignedToId, propertyId, overdue, dueToday, page = 1, pageSize = 50 } = filter

  const now = new Date()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)

  const where: Prisma.TaskWhereInput = {
    status: 'PENDING',
    ...(assignedToId && { assignedToId }),
    ...(propertyId && { propertyId }),
    ...(overdue && { dueAt: { lt: todayStart } }),
    ...(dueToday && { dueAt: { gte: todayStart, lte: todayEnd } }),
  }

  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true } },
        property: {
          select: {
            id: true,
            streetAddress: true,
            city: true,
            state: true,
            leadType: true,
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.task.count({ where }),
  ])

  return { rows, total, page, pageSize }
}
