import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export interface ActivityFeedFilter {
  propertyId?: string
  userId?: string
  page?: number
  pageSize?: number
}

export async function getActivityFeed(filter: ActivityFeedFilter) {
  const { propertyId, userId, page = 1, pageSize = 50 } = filter

  const where: Prisma.ActivityLogWhereInput = {
    ...(propertyId && { propertyId }),
    ...(userId && { userId }),
  }

  return prisma.activityLog.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
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
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  })
}
