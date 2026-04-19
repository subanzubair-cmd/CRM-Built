import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    vendor: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getVendorList, getVendorById } from '@/lib/vendors'

describe('getVendorList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns rows and total', async () => {
    ;(prisma.vendor.findMany as any).mockResolvedValue([{ id: 'v1' }])
    ;(prisma.vendor.count as any).mockResolvedValue(1)

    const result = await getVendorList({})

    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('includes contact info', async () => {
    ;(prisma.vendor.findMany as any).mockResolvedValue([])
    ;(prisma.vendor.count as any).mockResolvedValue(0)

    await getVendorList({})

    const call = (prisma.vendor.findMany as any).mock.calls[0][0]
    expect(call.include?.contact).toBeDefined()
  })

  it('filters by category', async () => {
    ;(prisma.vendor.findMany as any).mockResolvedValue([])
    ;(prisma.vendor.count as any).mockResolvedValue(0)

    await getVendorList({ category: 'PLUMBER' })

    expect(prisma.vendor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: 'PLUMBER' }),
      })
    )
  })
})

describe('getVendorById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches vendor with full contact info', async () => {
    ;(prisma.vendor.findUnique as any).mockResolvedValue(null)

    await getVendorById('vendor-1')

    expect(prisma.vendor.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vendor-1' },
        include: expect.objectContaining({ contact: expect.anything() }),
      })
    )
  })
})
