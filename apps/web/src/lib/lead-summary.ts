import {
  Property,
  PropertyContact,
  Contact,
  Conversation,
  Message,
  AiLog,
} from '@crm/database'
import { generateText } from '@/lib/ai'

export async function generateLeadSummary(propertyId: string): Promise<string> {
  const property = await Property.findByPk(propertyId, {
    include: [
      {
        model: PropertyContact,
        as: 'contacts',
        where: { isPrimary: true },
        required: false,
        separate: true,
        limit: 3,
        include: [
          { model: Contact, as: 'contact', attributes: ['firstName', 'lastName'] },
        ],
      },
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
            order: [['createdAt', 'ASC']],
            limit: 10,
          },
        ],
      },
    ],
  })
  if (!property) throw new Error(`Property ${propertyId} not found`)
  const plain = property.get({ plain: true }) as any

  const contactNames = (plain.contacts ?? [])
    .map((c: any) => `${c.contact?.firstName ?? ''} ${c.contact?.lastName ?? ''}`.trim())
    .filter(Boolean)
    .join(', ')

  const messages = (plain.conversations ?? [])
    .flatMap((conv: any) => conv.messages ?? [])
    .slice(0, 20)
  const msgText =
    messages.length > 0
      ? messages
          .map((m: any) => `[${m.channel}/${m.direction}]: ${m.body ?? '(no body)'}`)
          .join('\n')
      : 'No communications yet.'

  const systemPrompt = 'You are a real estate CRM assistant. Summarize leads concisely and accurately.'

  const prompt = `Summarize this lead in 2–3 sentences.

Property: ${plain.streetAddress ?? 'No address'}, ${plain.city ?? ''}, ${plain.state ?? ''}
Status: ${plain.leadStatus} | Stage: ${plain.activeLeadStage ?? 'N/A'}
Exit Strategy: ${plain.exitStrategy ?? 'Unknown'}
Contacts: ${contactNames || 'None'}

Recent Communications:
${msgText}

Write a concise summary of this lead's current situation and the single most important next action.`

  const summary = await generateText(prompt, systemPrompt)

  try {
    await AiLog.create({
      propertyId,
      engine: 'LEAD_SUMMARIZATION',
      input: {
        propertyId,
        stage: plain.activeLeadStage,
        messageCount: messages.length,
      },
      output: { summary },
    })
  } catch (err) {
    console.error('[lead-summary] AiLog write failed', err)
  }

  return summary
}
