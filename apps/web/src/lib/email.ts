import { prisma } from '@/lib/prisma'

export async function getEmailConversations(filter: { page?: number; pageSize?: number } = {}) {
  const { page = 1, pageSize = 25 } = filter

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where: { messages: { some: { channel: 'EMAIL' } } },
      include: {
        property: {
          select: {
            id: true,
            streetAddress: true,
            city: true,
            leadType: true,
            propertyStatus: true,
          },
        },
        _count: {
          select: { messages: { where: { channel: 'EMAIL' } } },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.conversation.count({
      where: { messages: { some: { channel: 'EMAIL' } } },
    }),
  ])

  return { rows, total }
}
