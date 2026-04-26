import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { Property, Market, PropertyContact, Contact, AiLog } from '@crm/database'
import { generateText } from '@/lib/ai'

const ChatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .max(20)
    .default([]),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = ChatSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { message, history } = parsed.data

  const propertyRow = await Property.findByPk(id, {
    include: [
      { model: Market, as: 'market', attributes: ['name'] },
      {
        model: PropertyContact,
        as: 'contacts',
        where: { isPrimary: true },
        required: false,
        separate: true,
        limit: 3,
        include: [
          { model: Contact, as: 'contact', attributes: ['firstName', 'lastName', 'phone', 'email'] },
        ],
      },
    ],
  })
  if (!propertyRow) throw new Error(`Property ${id} not found`)
  const property = propertyRow.get({ plain: true }) as any

  const contactList = (property.contacts ?? [])
    .map((c: any) =>
      `${c.contact?.firstName ?? ''} ${c.contact?.lastName ?? ''} (${c.contact?.phone ?? 'no phone'})`.trim(),
    )
    .join(', ')

  const system = `You are an AI assistant embedded in a real estate investment CRM. You have full context on the following lead:

Address: ${property.streetAddress ?? 'No address'}, ${property.city ?? ''}, ${property.state ?? ''} ${property.zip ?? ''}
Market: ${property.market?.name ?? 'Unassigned'}
Status: ${property.leadStatus} | Stage: ${property.activeLeadStage ?? 'N/A'}
Exit Strategy: ${property.exitStrategy ?? 'Not set'}
Asking Price: ${property.askingPrice ? `$${Number(property.askingPrice).toLocaleString()}` : 'Not set'}
Offer Price: ${property.offerPrice ? `$${Number(property.offerPrice).toLocaleString()}` : 'Not set'}
ARV: ${property.arv ? `$${Number(property.arv).toLocaleString()}` : 'Not set'}
Hot Lead: ${property.isHot ? 'Yes' : 'No'}
Contacts: ${contactList || 'None'}

Answer questions about this lead concisely. If asked about something not in the context above, say so honestly. Keep replies under 3 sentences unless the user asks for more detail.`

  const conversationPrompt = [
    ...history.map((h) => `${h.role === 'user' ? 'Human' : 'Assistant'}: ${h.content}`),
    `Human: ${message}`,
    'Assistant:',
  ].join('\n\n')

  try {
    const reply = await generateText(conversationPrompt, system)

    try {
      await AiLog.create({
        propertyId: id,
        engine: 'TEXT_CONVERSATIONAL',
        input: { message, historyLength: history.length },
        output: { reply },
      } as any)
    } catch (logErr) {
      console.error('[chat] AiLog write failed', logErr)
    }

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[chat] error:', err)
    return NextResponse.json({ error: 'AI response failed' }, { status: 500 })
  }
}
