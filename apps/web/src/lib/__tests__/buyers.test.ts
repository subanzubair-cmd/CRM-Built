import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    buyer: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getBuyerList, getBuyerById } from '@/lib/buyers'

describe('getBuyerList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns rows and total', async () => {
    ;(prisma.buyer.findMany as any).mockResolvedValue([{ id: 'b1' }])
    ;(prisma.buyer.count as any).mockResolvedValue(1)

    const result = await getBuyerList({})

    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('includes contact info', async () => {
    ;(prisma.buyer.findMany as any).mockResolvedValue([])
    ;(prisma.buyer.count as any).mockResolvedValue(0)

    await getBuyerList({})

    const call = (prisma.buyer.findMany as any).mock.calls[0][0]
    expect(call.include?.contact).toBeDefined()
  })

  it('filters by isActive when activeOnly is true', async () => {
    ;(prisma.buyer.findMany as any).mockResolvedValue([])
    ;(prisma.buyer.count as any).mockResolvedValue(0)

    await getBuyerList({ activeOnly: true })

    expect(prisma.buyer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      })
    )
  })
})

describe('getBuyerById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches buyer with criteria, matches, and offers', async () => {
    ;(prisma.buyer.findUnique as any).mockResolvedValue(null)

    await getBuyerById('buyer-1')

    expect(prisma.buyer.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'buyer-1' },
        include: expect.objectContaining({
          contact: expect.anything(),
          criteria: expect.anything(),
          matches: expect.anything(),
          offers: expect.anything(),
        }),
      })
    )
  })
})
