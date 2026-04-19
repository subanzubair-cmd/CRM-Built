import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

const DECIMAL_FIELDS = ['bathrooms', 'askingPrice', 'offerPrice', 'arv', 'repairEstimate', 'lotSize', 'contractPrice', 'expectedProfit', 'underContractPrice', 'estimatedValue', 'dispoOfferAmount', 'soldPrice'] as const

function serializeRow<T extends Record<string, any>>(row: T): T {
  const out: any = { ...row }
  for (const f of DECIMAL_FIELDS) {
    if (out[f] != null) out[f] = Number(out[f])
  }
  return out
}

export interface PipelineFilter {
  search?: string
  assignedToId?: string
  page?: number
  pageSize?: number
  marketScope?: string[] | null
}

const PROPERTY_LIST_INCLUDE = {
  contacts: {
    where: { isPrimary: true },
    include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
    take: 1,
  },
  assignedTo: { select: { id: true, name: true } },
  _count: { select: { tasks: { where: { status: 'PENDING' as const } } } },
} satisfies Prisma.PropertyInclude

function buildSearchOr(search: string): Prisma.PropertyWhereInput['OR'] {
  return [
    { normalizedAddress: { contains: search, mode: 'insensitive' } },
    { streetAddress: { contains: search, mode: 'insensitive' } },
    { city: { contains: search, mode: 'insensitive' } },
    {
      contacts: {
        some: {
          contact: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      },
    },
  ]
}

export async function getTmList(filter: PipelineFilter) {
  const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter

  const where: Prisma.PropertyWhereInput = {
    propertyStatus: 'IN_TM',
    ...(assignedToId && { assignedToId }),
    ...(marketScope !== null && marketScope !== undefined && { marketId: { in: marketScope } }),
    ...(search && { OR: buildSearchOr(search) }),
  }

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: PROPERTY_LIST_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
  ])

  return { rows: rows.map(serializeRow), total, page, pageSize }
}

export async function getInventoryList(filter: PipelineFilter) {
  const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter

  const where: Prisma.PropertyWhereInput = {
    propertyStatus: 'IN_INVENTORY',
    ...(assignedToId && { assignedToId }),
    ...(marketScope !== null && marketScope !== undefined && { marketId: { in: marketScope } }),
    ...(search && { OR: buildSearchOr(search) }),
  }

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: PROPERTY_LIST_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
  ])

  return { rows: rows.map(serializeRow), total, page, pageSize }
}

export async function getDispoList(filter: PipelineFilter) {
  const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter

  const where: Prisma.PropertyWhereInput = {
    inDispo: true,
    ...(assignedToId && { assignedToId }),
    ...(marketScope !== null && marketScope !== undefined && { marketId: { in: marketScope } }),
    ...(search && { OR: buildSearchOr(search) }),
  }

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: {
        contacts: {
          where: { isPrimary: true },
          include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
          take: 1,
        },
        assignedTo: { select: { id: true, name: true } },
        _count: {
          select: {
            tasks: { where: { status: 'PENDING' } },
            buyerMatches: true,
          },
        },
        offers: {
          select: { buyerId: true },
          distinct: ['buyerId'],
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
  ])

  return { rows: rows.map(serializeRow), total, page, pageSize }
}

export async function getPropertyById(id: string) {
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      contacts: {
        include: { contact: true },
        orderBy: { isPrimary: 'desc' },
      },
      notes: { orderBy: { createdAt: 'desc' }, take: 50 },
      tasks: {
        include: { assignedTo: { select: { id: true, name: true } } },
        orderBy: { dueAt: 'asc' },
      },
      activityLogs: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
      stageHistory: { orderBy: { createdAt: 'desc' }, take: 20 },
      assignedTo: { select: { id: true, name: true } },
      market: { select: { id: true, name: true } },
      buyerMatches: {
        include: {
          buyer: {
            include: {
              contact: { select: { firstName: true, lastName: true, phone: true, email: true } },
            },
          },
        },
        orderBy: { score: 'desc' },
      },
      offers: {
        include: {
          buyer: {
            include: {
              contact: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
      },
    },
  })
  return property ? serializeRow(property) : null
}

export async function getDispoPropertyBuyerMatches(propertyId: string) {
  return prisma.buyerMatch.findMany({
    where: { propertyId },
    include: {
      buyer: {
        include: {
          contact: { select: { firstName: true, lastName: true, phone: true, email: true } },
        },
      },
    },
    orderBy: { score: 'desc' },
  })
}
