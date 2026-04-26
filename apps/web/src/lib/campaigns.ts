import { prisma } from '@/lib/prisma'
import {
  Campaign,
  CampaignStep,
  CampaignEnrollment,
  Market,
  Op,
  literal,
} from '@crm/database'

export interface CampaignFilter {
  type?: 'DRIP' | 'BROADCAST'
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  search?: string
  page?: number
  pageSize?: number
}

export async function getCampaignList(filter: CampaignFilter = {}) {
  const { type, status, search, page = 1, pageSize = 25 } = filter

  const where: Record<string, unknown> = {}
  if (type) where.type = type
  if (status) where.status = status
  if (search) where.name = { [Op.iLike]: `%${search}%` }

  const [rows, total] = await Promise.all([
    Campaign.findAll({
      where,
      // Stays in line with the original Prisma response: market name + counts.
      include: [{ model: Market, as: 'market', attributes: ['name'] }],
      attributes: {
        include: [
          [
            literal(
              `(SELECT COUNT(*)::int FROM "CampaignStep" cs WHERE cs."campaignId" = "Campaign"."id")`,
            ),
            'stepCount',
          ],
          [
            literal(
              `(SELECT COUNT(*)::int FROM "CampaignEnrollment" ce WHERE ce."campaignId" = "Campaign"."id")`,
            ),
            'enrollmentCount',
          ],
        ],
      },
      order: [['updatedAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
    }),
    Campaign.count({ where }),
  ])

  // Re-shape into the legacy `_count: { steps, enrollments }` envelope so
  // the campaigns table doesn't need a frontend update.
  const shaped = rows.map((r) => {
    const json = r.toJSON() as any
    return {
      ...json,
      _count: {
        steps: Number(json.stepCount ?? 0),
        enrollments: Number(json.enrollmentCount ?? 0),
      },
    }
  })

  return { rows: shaped, total }
}

export async function getCampaignById(id: string) {
  // Sequelize returns the campaign + its steps via include. The enrollment →
  // property join still lives on Prisma until Phase 6, so we fetch it
  // separately and re-shape into the same payload.
  const campaign = await Campaign.findByPk(id, {
    include: [
      { model: Market, as: 'market' },
      {
        model: CampaignStep,
        as: 'steps',
        separate: true,
        order: [['order', 'ASC']],
      },
    ],
  })
  if (!campaign) return null

  const enrollments = await CampaignEnrollment.findAll({
    where: { campaignId: id, isActive: true },
    order: [['enrolledAt', 'DESC']],
    limit: 50,
  })

  // Pull lightweight Property info via Prisma — Property migrates in Phase 6.
  const propertyIds = enrollments.map((e) => e.propertyId)
  const properties =
    propertyIds.length > 0
      ? await prisma.property.findMany({
          where: { id: { in: propertyIds } },
          select: {
            id: true,
            streetAddress: true,
            city: true,
            propertyStatus: true,
            leadType: true,
          },
        })
      : []
  const propertyById = new Map(properties.map((p) => [p.id, p]))

  return {
    ...(campaign.toJSON() as any),
    enrollments: enrollments.map((e) => ({
      ...(e.toJSON() as any),
      property: propertyById.get(e.propertyId) ?? null,
    })),
  }
}
