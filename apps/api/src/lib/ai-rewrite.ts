import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface PropertyContext {
  streetAddress?: string | null
  city?: string | null
  state?: string | null
  source?: string | null
  activeLeadStage?: string | null
}

/**
 * Rewrites a drip campaign message body to personalize it for a specific property.
 * Falls back to original body on error or if no API key.
 */
export async function rewriteForProperty(
  originalBody: string,
  property: PropertyContext
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return originalBody
  const address = [property.streetAddress, property.city, property.state].filter(Boolean).join(', ') || 'the property'
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a real estate wholesaling assistant. Rewrite the SMS message to personalize it for the given property address. Keep it under 160 characters, natural, and conversational. Return only the rewritten message, no explanation.' },
        { role: 'user', content: `Property: ${address}\nOriginal message: ${originalBody}` },
      ],
      max_tokens: 200,
      temperature: 0.7,
    })
    return completion.choices[0]?.message?.content?.trim() ?? originalBody
  } catch (err) {
    console.error('[ai-rewrite] Error:', err)
    return originalBody
  }
}
