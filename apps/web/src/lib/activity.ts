import { ActivityLog, Property, User } from '@crm/database'
import type { WhereOptions } from '@crm/database'

export interface ActivityFeedFilter {
  propertyId?: string
  userId?: string
  page?: number
  pageSize?: number
}

export interface ActivityFeedRow {
  id: string
  propertyId: string | null
  userId: string | null
  userName: string | null
  action: string
  actorType: string
  detail: Record<string, unknown>
  createdAt: Date
  user: { id: string; name: string; avatarUrl: string | null } | null
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    state: string | null
    leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
  } | null
}

export async function getActivityFeed(
  filter: ActivityFeedFilter,
): Promise<ActivityFeedRow[]> {
  const { propertyId, userId, page = 1, pageSize = 50 } = filter

  const where: WhereOptions = {}
  if (propertyId) (where as any).propertyId = propertyId
  if (userId) (where as any).userId = userId

  const rows = await ActivityLog.findAll({
    where,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'avatarUrl'],
      },
      {
        model: Property,
        as: 'property',
        attributes: ['id', 'streetAddress', 'city', 'state', 'leadType'],
      },
    ],
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
    raw: true,
    nest: true,
  })
  return rows as unknown as ActivityFeedRow[]
}
