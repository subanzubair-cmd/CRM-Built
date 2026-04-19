import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    activityLog: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getTaskList } from '@/lib/tasks'
import { getActivityFeed } from '@/lib/activity'

describe('getTaskList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches PENDING tasks by default', async () => {
    ;(prisma.task.findMany as any).mockResolvedValue([])
    ;(prisma.task.count as any).mockResolvedValue(0)

    await getTaskList({})

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
      })
    )
  })

  it('filters by assignedToId when provided', async () => {
    ;(prisma.task.findMany as any).mockResolvedValue([])
    ;(prisma.task.count as any).mockResolvedValue(0)

    await getTaskList({ assignedToId: 'user-1' })

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assignedToId: 'user-1' }),
      })
    )
  })

  it('filters overdue tasks when overdue flag is set', async () => {
    ;(prisma.task.findMany as any).mockResolvedValue([])
    ;(prisma.task.count as any).mockResolvedValue(0)

    await getTaskList({ overdue: true })

    const call = (prisma.task.findMany as any).mock.calls[0][0]
    expect(call.where.dueAt).toBeDefined()
  })
})

describe('getActivityFeed', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches activity logs with user info', async () => {
    ;(prisma.activityLog.findMany as any).mockResolvedValue([])

    await getActivityFeed({})

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          user: expect.anything(),
        }),
      })
    )
  })
})
