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
import { generateLeadSummary } from '../lead-summary'

describe('generateLeadSummary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls generateText with property context and returns the summary', async () => {
    vi.mocked(prisma.property.findUniqueOrThrow).mockResolvedValue({
      id: 'p1',
      streetAddress: '123 Main St',
      city: 'Dallas',
      state: 'TX',
      leadStatus: 'ACTIVE',
      activeLeadStage: 'OFFER_MADE',
      exitStrategy: 'WHOLESALE',
      contacts: [
        { contact: { firstName: 'John', lastName: 'Smith' } },
      ],
      conversations: [
        { messages: [{ channel: 'SMS', direction: 'INBOUND', body: 'I want to sell fast.' }] },
      ],
    } as any)
    vi.mocked(generateText).mockResolvedValue('Motivated seller at offer stage — follow up today.')
    vi.mocked(prisma.aiLog.create).mockResolvedValue({} as any)

    const result = await generateLeadSummary('p1')

    expect(result).toBe('Motivated seller at offer stage — follow up today.')
    expect(generateText).toHaveBeenCalledWith(
      expect.stringContaining('123 Main St'),
      expect.stringContaining('real estate CRM assistant'),
    )
  })

  it('persists an AiLog record with engine LEAD_SUMMARIZATION', async () => {
    vi.mocked(prisma.property.findUniqueOrThrow).mockResolvedValue({
      id: 'p2',
      streetAddress: null,
      city: null,
      state: null,
      leadStatus: 'ACTIVE',
      activeLeadStage: null,
      exitStrategy: null,
      contacts: [],
      conversations: [],
    } as any)
    vi.mocked(generateText).mockResolvedValue('No communications yet.')
    vi.mocked(prisma.aiLog.create).mockResolvedValue({} as any)

    await generateLeadSummary('p2')

    expect(prisma.aiLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ engine: 'LEAD_SUMMARIZATION', propertyId: 'p2' }),
      })
    )
  })
})
