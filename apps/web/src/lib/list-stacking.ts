import { ListStackSource, Property, Op, literal } from '@crm/database'

export async function getListSources() {
  return ListStackSource.findAll({
    order: [['createdAt', 'DESC']],
    raw: true,
  })
}

export async function getOverlapProperties(limit = 50) {
  const sources = await ListStackSource.findAll({ attributes: ['id'], raw: true }) as unknown as Array<{ id: string }>
  if (sources.length < 2) return []

  const allListTags = sources.map((s) => `list:${s.id}`)
  const escaped = allListTags.map((t) => `'${t.replace(/'/g, "''")}'`).join(',')

  const properties = await Property.findAll({
    where: {
      // Postgres array && (overlap) operator: any element of `tags` matches any in our list.
      id: {
        [Op.in]: literal(`(SELECT id FROM "Property" WHERE "tags" && ARRAY[${escaped}]::text[])`),
      },
    },
    attributes: ['id', 'streetAddress', 'city', 'state', 'zip', 'tags', 'leadType', 'propertyStatus'],
    limit: 1000,
    raw: true,
  }) as unknown as Array<{ id: string; tags: string[] | null; [k: string]: unknown }>

  return properties
    .filter((p) => (p.tags ?? []).filter((t) => t.startsWith('list:')).length >= 2)
    .map((p) => ({
      ...p,
      stackScore: (p.tags ?? []).filter((t) => t.startsWith('list:')).length,
    }))
    .sort((a, b) => b.stackScore - a.stackScore)
    .slice(0, limit)
}
