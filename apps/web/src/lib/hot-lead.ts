import { Property, Conversation, Message, AiLog } from '@crm/database'
import { generateText } from '@/lib/ai'

export async function scoreHotLead(propertyId: string): Promise<number> {
  const property = await Property.findByPk(propertyId, {
    include: [
      {
        model: Conversation,
        as: 'conversations',
        separate: true,
        order: [['updatedAt', 'DESC']],
        limit: 2,
        include: [
          {
            model: Message,
            as: 'messages',
            separate: true,
            order: [['createdAt', 'DESC']],
            limit: 10,
          },
        ],
      },
    ],
  })
  if (!property) throw new Error(`Property ${propertyId} not found`)
  const plain = property.get({ plain: true }) as any

  const messages = (plain.conversations ?? [])
    .flatMap((c: any) => c.messages ?? [])
    .slice(0, 10)
  const msgText =
    messages.length > 0
      ? messages.map((m: any) => `[${m.direction}]: ${m.body ?? '(no body)'}`).join('\n')
      : 'No messages yet.'

  const system = 'You are a real estate investment analyst. Return only a single integer score.'

  const prompt = `Score this lead from 0 to 100 based on how likely it is to close soon.

Stage: ${plain.activeLeadStage ?? 'Unknown'}
Recent messages:
${msgText}

Scoring guide:
- 80–100: Highly motivated seller, late stage, strong engagement
- 60–79: Active engagement, mid to late stage
- 40–59: Some interest, early to mid stage
- 0–39: Cold, no engagement, or dead end

Respond with ONLY a single integer between 0 and 100. No text, no punctuation.`

  const text = await generateText(prompt, system)
  const parsed = parseInt(text.trim(), 10)
  const score = isNaN(parsed) ? 50 : Math.max(0, Math.min(100, parsed))

  try {
    await AiLog.create({
      propertyId,
      engine: 'HOT_LEAD_DETECTION',
      input: {
        propertyId,
        stage: plain.activeLeadStage,
        messageCount: messages.length,
      },
      output: { score },
    })
  } catch (err) {
    console.error('[hot-lead] AiLog write failed', err)
  }

  return score
}
