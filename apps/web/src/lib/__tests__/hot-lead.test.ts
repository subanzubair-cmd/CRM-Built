import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    property: { findUniqueOrThrow: vi.fn() },
    aiLog: { create: vi.fn() },
  },
}))

vi.mock('@/lib/ai', () => ({
  generateText: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai'
import { scoreHotLead } from '../hot-lead'

describe('scoreHotLead', () => {
  beforeEach(() => vi.clearAllMocks())

  it('parses numeric score from AI response', async () => {
    vi.mocked(prisma.property.findUniqueOrThrow).mockResolvedValue({
      id: 'p1',
      activeLeadStage: 'OFFER_MADE',
      conversations: [
        { messages: [{ direction: 'INBOUND', body: 'I need to sell ASAP, very motivated.' }] },
      ],
    } as any)
    vi.mocked(generateText).mockResolvedValue('82')
    vi.mocked(prisma.aiLog.create).mockResolvedValue({} as any)

    const score = await scoreHotLead('p1')

    expect(score).toBe(82)
    expect(prisma.aiLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ engine: 'HOT_LEAD_DETECTION' }),
      })
    )
  })

  it('defaults to 50 when AI returns non-numeric text', async () => {
    vi.mocked(prisma.property.findUniqueOrThrow).mockResolvedValue({
      id: 'p2',
      activeLeadStage: null,
      conversations: [],
    } as any)
    vi.mocked(generateText).mockResolvedValue('I cannot determine the score.')
    vi.mocked(prisma.aiLog.create).mockResolvedValue({} as any)

    const score = await scoreHotLead('p2')

    expect(score).toBe(50)
  })
})
