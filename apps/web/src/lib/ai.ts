import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

export async function generateText(prompt: string, system?: string): Promise<string> {
  const msg = await getClient().messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1024,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }],
  })
  const block = msg.content[0]
  if (block.type !== 'text') throw new Error('Unexpected content type from AI')
  return block.text
}
