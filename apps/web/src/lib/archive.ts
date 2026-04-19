import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

const DECIMAL_FIELDS = ['bathrooms', 'askingPrice', 'offerPrice', 'arv', 'repairEstimate', 'lotSize', 'contractPrice', 'expectedProfit', 'underContractPrice', 'estimatedValue', 'soldPrice'] as const

function serializeRow<T extends Record<string, any>>(row: T): T {
  const out: any = { ...row }
  for (const f of DECIMAL_FIELDS) {
    if (out[f] != null) out[f] = Number(out[f])
  }
  return out
}

export interface ArchiveFilter {
  search?: string
  assignedToId?: string
  page?: number
  pageSize?: number
  marketScope?: string[] | null
}

const ARCHIVE_LIST_INCLUDE = {
  contacts: {
    where: { isPrimary: true },
    include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
    take: 1,
  },
  assignedTo: { select: { id: true, name: true } },
} satisfies Prisma.PropertyInclude

function buildSearchOr(search: string): Prisma.PropertyWhereInput['OR'] {
  return [
    { normalizedAddress: { contains: search, mode: 'insensitive' } },
    { streetAddress: { contains: search, mode: 'insensitive' } },
    { city: { contains: search, mode: 'insensitive' } },
  ]
}

export async function getSoldList(filter: ArchiveFilter) {
  const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter

  const where: Prisma.PropertyWhereInput = {
    propertyStatus: 'SOLD',
    ...(assignedToId && { assignedToId }),
    ...(marketScope !== null && marketScope !== undefined && { marketId: { in: marketScope } }),
    ...(search && { OR: buildSearchOr(search) }),
  }

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: ARCHIVE_LIST_INCLUDE,
      orderBy: { soldAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
  ])

  return { rows: rows.map(serializeRow), total, page, pageSize }
}

export async function getRentalList(filter: ArchiveFilter) {
  const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter

  const where: Prisma.PropertyWhereInput = {
    propertyStatus: 'RENTAL',
    ...(assignedToId && { assignedToId }),
    ...(marketScope !== null && marketScope !== undefined && { marketId: { in: marketScope } }),
    ...(search && { OR: buildSearchOr(search) }),
  }

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: ARCHIVE_LIST_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
  ])

  return { rows: rows.map(serializeRow), total, page, pageSize }
}
