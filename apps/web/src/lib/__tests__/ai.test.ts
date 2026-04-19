import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}))

import { generateText } from '../ai'

describe('generateText', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns text content from the AI response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello from AI' }],
    })
    const result = await generateText('What is this lead about?')
    expect(result).toBe('Hello from AI')
  })

  it('passes system prompt when provided', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
    })
    await generateText('user message', 'You are a CRM assistant.')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'You are a CRM assistant.' })
    )
  })
})
