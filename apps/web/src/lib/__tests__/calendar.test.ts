import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    appointment: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getAppointmentList } from '@/lib/calendar'

describe('getAppointmentList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches upcoming appointments by default', async () => {
    ;(prisma.appointment.findMany as any).mockResolvedValue([])
    ;(prisma.appointment.count as any).mockResolvedValue(0)

    await getAppointmentList({})

    const call = (prisma.appointment.findMany as any).mock.calls[0][0]
    expect(call.where.startAt).toBeDefined()
  })

  it('includes property info', async () => {
    ;(prisma.appointment.findMany as any).mockResolvedValue([])
    ;(prisma.appointment.count as any).mockResolvedValue(0)

    await getAppointmentList({})

    const call = (prisma.appointment.findMany as any).mock.calls[0][0]
    expect(call.include?.property).toBeDefined()
  })
})
