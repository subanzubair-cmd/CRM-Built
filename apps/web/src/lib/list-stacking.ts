import { prisma } from '@/lib/prisma'

export async function getListSources() {
  return prisma.listStackSource.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

export async function getOverlapProperties(limit = 50) {
  const sources = await prisma.listStackSource.findMany({ select: { id: true } })
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
