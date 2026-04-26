import { Task, User, Property, Op } from '@crm/database'
import type { WhereOptions } from '@crm/database'

export interface TaskListFilter {
  assignedToId?: string
  propertyId?: string
  overdue?: boolean
  dueToday?: boolean
  page?: number
  pageSize?: number
}

export interface TaskListRow {
  id: string
  propertyId: string | null
  title: string
  description: string | null
  type: string
  status: string
  priority: number
  dueAt: Date | null
  completedAt: Date | null
  assignedToId: string | null
  createdById: string | null
  dueTime: string | null
  sourceType: string | null
  templateId: string | null
  repeatType: string | null
  repeatConfigJson: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
  assignedTo: { id: string; name: string } | null
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    state: string | null
    leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
  } | null
}

export async function getTaskList(filter: TaskListFilter): Promise<{
  rows: TaskListRow[]
  total: number
  page: number
  pageSize: number
}> {
  const { assignedToId, propertyId, overdue, dueToday, page = 1, pageSize = 50 } = filter

  const now = new Date()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)

  const where: WhereOptions = { status: 'PENDING' }
  if (assignedToId) (where as any).assignedToId = assignedToId
  if (propertyId) (where as any).propertyId = propertyId
  if (overdue) (where as any).dueAt = { [Op.lt]: todayStart }
  if (dueToday) (where as any).dueAt = { [Op.gte]: todayStart, [Op.lte]: todayEnd }

  const [rows, total] = await Promise.all([
    Task.findAll({
      where,
      include: [
        { model: User, as: 'assignedTo', attributes: ['id', 'name'] },
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'streetAddress', 'city', 'state', 'leadType'],
        },
      ],
      order: [['dueAt', 'ASC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      raw: true,
      nest: true,
    }),
    Task.count({ where }),
  ])

  return {
    rows: rows as unknown as TaskListRow[],
    total,
    page,
    pageSize,
  }
}
