import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export type ChannelFilter = 'ALL' | 'SMS' | 'CALL' | 'NOTE'

export interface ConversationListFilter {
  unreadOnly?: boolean
  channel?: ChannelFilter
  page?: number
  pageSize?: number
  /**
   * When provided, restrict results to conversations on properties whose
   * marketId is in this array. Pass null/undefined to skip scoping (admin).
   */
  marketIds?: string[] | null
}

/**
 * Fetch conversation list with contact info, last message preview, and unread count.
 * Supports channel filtering by checking if the conversation has messages of that type.
 */
export async function getConversationList(filter: ConversationListFilter) {
  const { unreadOnly, channel = 'ALL', page = 1, pageSize = 50, marketIds } = filter

  const where: Prisma.ConversationWhereInput = {
    ...(unreadOnly && { isRead: false }),
    ...(channel !== 'ALL' && {
      messages: {
        some: { channel: channel === 'NOTE' ? 'NOTE' : channel === 'CALL' ? 'CALL' : 'SMS' },
      },
    }),
    ...(marketIds !== null && marketIds !== undefined
      ? { property: { marketId: marketIds.length > 0 ? { in: marketIds } : '__NO_MARKET__' } }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        property: {
          select: {
            id: true,
            streetAddress: true,
            city: true,
            state: true,
            zip: true,
            leadType: true,
            propertyStatus: true,
            contacts: {
              where: { isPrimary: true },
              take: 1,
              include: {
                contact: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                    email: true,
                  },
                },
              },
            },
            _count: {
              select: {
                tasks: { where: { status: 'PENDING' } },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            body: true,
            channel: true,
            createdAt: true,
          },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.conversation.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export type ConversationRow = Awaited<ReturnType<typeof getConversationList>>['rows'][number]

export async function getConversationMessages(propertyId: string, limit = 200) {
  return prisma.message.findMany({
    where: { propertyId },
    include: {
      sentBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
}

export type ConversationMessage = Awaited<ReturnType<typeof getConversationMessages>>[number]

/**
 * Fetch context data for the right panel: property + contact + task/lead counts.
 */
export async function getConversationContext(propertyId: string) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      streetAddress: true,
      city: true,
      state: true,
      zip: true,
      propertyStatus: true,
      leadType: true,
      tmStage: true,
      inventoryStage: true,
      assignedTo: { select: { name: true } },
      contacts: {
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              phone2: true,
              email: true,
              type: true,
            },
          },
        },
        orderBy: { isPrimary: 'desc' },
      },
      _count: {
        select: {
          tasks: { where: { status: 'PENDING' } },
          messages: true,
          conversations: true,
        },
      },
    },
  })

  return property
}

export type ConversationContext = NonNullable<Awaited<ReturnType<typeof getConversationContext>>>
