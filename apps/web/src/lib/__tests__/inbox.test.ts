import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getConversationList, getConversationMessages } from '@/lib/inbox'

describe('getConversationList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches conversations ordered by lastMessageAt desc', async () => {
    ;(prisma.conversation.findMany as any).mockResolvedValue([])
    ;(prisma.conversation.count as any).mockResolvedValue(0)

    await getConversationList({})

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { lastMessageAt: 'desc' },
      })
    )
  })

  it('includes property and message count', async () => {
    ;(prisma.conversation.findMany as any).mockResolvedValue([])
    ;(prisma.conversation.count as any).mockResolvedValue(0)

    await getConversationList({})

    const call = (prisma.conversation.findMany as any).mock.calls[0][0]
    expect(call.include).toBeDefined()
  })
})

describe('getConversationMessages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches messages for a property ordered by createdAt asc', async () => {
    ;(prisma.message.findMany as any).mockResolvedValue([])

    await getConversationMessages('prop-1')

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { propertyId: 'prop-1' },
        orderBy: { createdAt: 'asc' },
      })
    )
  })
})
