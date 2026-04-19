import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export interface BuyerListFilter {
  search?: string
  activeOnly?: boolean
  page?: number
  pageSize?: number
  marketScope?: string[] | null
}

const BUYER_LIST_INCLUDE = {
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
    },
  },
  _count: {
    select: {
      criteria: true,
      matches: true,
      offers: true,
    },
  },
  // Deals = buyer matches in SOLD stage of dispo pipeline
  matches: {
    where: { dispoStage: 'SOLD' },
    select: { propertyId: true, dispoOfferAmount: true },
  },
} satisfies Prisma.BuyerInclude

export async function getBuyerList(filter: BuyerListFilter) {
  const { search, activeOnly, page = 1, pageSize = 50, marketScope } = filter

  const where: Prisma.BuyerWhereInput = {
    ...(activeOnly && { isActive: true }),
    ...(marketScope !== null && marketScope !== undefined && (
      marketScope.length > 0
        ? { markets: { hasSome: marketScope } }
        // Prisma does not support `hasSome: []` on scalar list fields — it would
        // throw a runtime error. Use an impossible id to guarantee zero results
        // when the user has no market access (empty scope).
        : { id: '' }
    )),
    ...(search && {
      contact: {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      },
    }),
  }

  const [rows, total] = await Promise.all([
    prisma.buyer.findMany({
      where,
      include: BUYER_LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.buyer.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function getBuyerDashboardStats() {
  const [
    totalBuyers,
    totalAgents,
    withEmail,
    withPhone,
    activeBuyers,
  ] = await Promise.all([
    prisma.contact.count({ where: { type: 'BUYER' } }),
    prisma.contact.count({ where: { type: 'AGENT' } }),
    prisma.contact.count({
      where: {
        type: { in: ['BUYER', 'AGENT'] },
        email: { not: null },
      },
    }),
    prisma.contact.count({
      where: {
        type: { in: ['BUYER', 'AGENT'] },
        phone: { not: null },
      },
    }),
    prisma.buyer.count({ where: { isActive: true } }),
  ])

  const totalContacts = totalBuyers + totalAgents

  // Count contacts with at least one offer (via buyerProfile)
  const withDeals = await prisma.buyer.count({
    where: {
      offers: { some: {} },
    },
  })

  return {
    totalContacts,
    totalBuyers,
    totalAgents,
    withEmail,
    withPhone,
    withDeals,
    activeBuyers,
  }
}

export async function getTopBuyers(limit = 5) {
  // Deals = buyer matches in SOLD stage of dispo pipeline
  const buyers = await prisma.buyer.findMany({
    where: {
      matches: { some: { dispoStage: 'SOLD' } },
    },
    include: {
      contact: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      matches: {
        where: { dispoStage: 'SOLD' },
        select: {
          dispoOfferAmount: true,
        },
      },
    },
    take: 50,
  })

  const sorted = buyers
    .map((b) => ({
      id: b.id,
      name: [b.contact.firstName, b.contact.lastName].filter(Boolean).join(' '),
      dealsCount: b.matches.length,
      totalOfferAmount: b.matches.reduce((sum, m) => sum + (m.dispoOfferAmount ? Number(m.dispoOfferAmount) : 0), 0),
    }))
    .sort((a, b) => b.dealsCount - a.dealsCount)
    .slice(0, limit)

  return sorted
}

export async function getRecentBuyerMessages(limit = 20) {
  const messages = await prisma.message.findMany({
    where: {
      contact: {
        type: { in: ['BUYER', 'AGENT'] },
      },
    },
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          buyerProfile: { select: { id: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return messages.map((m) => ({
    id: m.id,
    buyerName: [m.contact?.firstName, m.contact?.lastName].filter(Boolean).join(' '),
    buyerId: m.contact?.buyerProfile?.id ?? null,
    body: m.body,
    channel: m.channel,
    direction: m.direction,
    createdAt: m.createdAt,
  }))
}

export async function getBuyerCampaigns() {
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: { not: 'DRAFT' },
    },
    include: {
      _count: {
        select: { enrollments: true },
      },
      steps: {
        where: { channel: 'SMS' },
        select: { id: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  // Only return campaigns that have at least one SMS step
  return campaigns
    .filter((c) => c.steps.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      type: c.type,
      createdAt: c.createdAt,
      recipients: c._count.enrollments,
    }))
}

export async function getBuyerById(id: string) {
  return prisma.buyer.findUnique({
    where: { id },
    include: {
      contact: true,
      criteria: { orderBy: { createdAt: 'desc' } },
      matches: {
        include: {
          property: {
            select: {
              id: true,
              streetAddress: true,
              city: true,
              state: true,
              zip: true,
              propertyStatus: true,
              leadType: true,
            },
          },
        },
        orderBy: { score: 'desc' },
        take: 50,
      },
      offers: {
        include: {
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
        orderBy: { submittedAt: 'desc' },
        take: 50,
      },
    },
  })
}
