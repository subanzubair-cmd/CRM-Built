import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai'

export async function generateLeadSummary(propertyId: string): Promise<string> {
  const property = await prisma.property.findUniqueOrThrow({
    where: { id: propertyId },
    include: {
      contacts: {
        where: { isPrimary: true },
        include: { contact: { select: { firstName: true, lastName: true } } },
        take: 3,
      },
      conversations: {
        orderBy: { updatedAt: 'desc' },
        take: 2,
        include: {
          messages: { orderBy: { createdAt: 'asc' }, take: 10 },
        },
      },
    },
  })

  const contactNames = property.contacts
    .map((c) => `${c.contact.firstName} ${c.contact.lastName ?? ''}`.trim())
    .filter(Boolean)
    .join(', ')

  const messages = property.conversations.flatMap((conv) => conv.messages).slice(0, 20)
  const msgText =
    messages.length > 0
      ? messages
          .map((m) => `[${m.channel}/${m.direction}]: ${m.body ?? '(no body)'}`)
          .join('\n')
      : 'No communications yet.'

  const systemPrompt = 'You are a real estate CRM assistant. Summarize leads concisely and accurately.'

  const prompt = `Summarize this lead in 2–3 sentences.

Property: ${property.streetAddress ?? 'No address'}, ${property.city ?? ''}, ${property.state ?? ''}
Status: ${property.leadStatus} | Stage: ${property.activeLeadStage ?? 'N/A'}
Exit Strategy: ${property.exitStrategy ?? 'Unknown'}
Contacts: ${contactNames || 'None'}

Recent Communications:
${msgText}

Write a concise summary of this lead's current situation and the single most important next action.`

  const summary = await generateText(prompt, systemPrompt)

  try {
    await prisma.aiLog.create({
      data: {
        propertyId,
        engine: 'LEAD_SUMMARIZATION',
        input: {
          propertyId,
          stage: property.activeLeadStage,
          messageCount: messages.length,
        },
        output: { summary },
      },
    })
  } catch (err) {
    console.error('[lead-summary] AiLog write failed', err)
  }

  return summary
}
