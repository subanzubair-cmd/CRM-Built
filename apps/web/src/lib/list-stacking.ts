import { prisma } from '@/lib/prisma'
import { ListStackSource } from '@crm/database'

export async function getListSources() {
  return ListStackSource.findAll({
    order: [['createdAt', 'DESC']],
    raw: true,
  })
}

export async function getOverlapProperties(limit = 50) {
  // Sources moved to Sequelize; properties stay on Prisma until Phase 6.
  const sources = await ListStackSource.findAll({ attributes: ['id'], raw: true })
  if (sources.length < 2) return []

  const allListTags = sources.map((s) => `list:${s.id}`)

  const properties = await prisma.property.findMany({
    where: { tags: { hasSome: allListTags } },
    select: {
      id: true,
      streetAddress: true,
      city: true,
      state: true,
      zip: true,
      tags: true,
      leadType: true,
      propertyStatus: true,
    },
    take: 1000,
  })

  return properties
    .filter((p) => p.tags.filter((t) => t.startsWith('list:')).length >= 2)
    .map((p) => ({
      ...p,
      stackScore: p.tags.filter((t) => t.startsWith('list:')).length,
    }))
    .sort((a, b) => b.stackScore - a.stackScore)
    .slice(0, limit)
}
