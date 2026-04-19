import { prisma } from '@/lib/prisma'
import type { Prisma } from '@crm/database'

export interface CampaignFilter {
  type?: 'DRIP' | 'BROADCAST'
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  search?: string
  page?: number
  pageSize?: number
}

export async function getCampaignList(filter: CampaignFilter = {}) {
  const { type, status, search, page = 1, pageSize = 25 } = filter

  const where: Prisma.CampaignWhereInput = {}
  if (type) where.type = type
  if (status) where.status = status
  if (search) where.name = { contains: search, mode: 'insensitive' }

  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: {
        market: { select: { name: true } },
        _count: { select: { steps: true, enrollments: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.campaign.count({ where }),
  ])

  return { rows, total }
}

export async function getCampaignById(id: string) {
  return prisma.campaign.findUnique({
    where: { id },
    include: {
      market: true,
      steps: { orderBy: { order: 'asc' } },
      enrollments: {
        where: { isActive: true },
        include: {
          property: {
            select: {
              id: true,
              streetAddress: true,
              city: true,
              propertyStatus: true,
              leadType: true,
            },
          },
        },
        orderBy: { enrolledAt: 'desc' },
        take: 50,
      },
    },
  })
}
