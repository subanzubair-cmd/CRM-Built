import { prisma } from './prisma'

export type SendChannel = 'sms' | 'call' | 'email'

export async function checkDndByContactId(
  contactId: string | null | undefined,
  channel: SendChannel,
): Promise<string | null> {
  if (!contactId) return null
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { doNotCall: true, doNotText: true, doNotEmail: true },
  })
  if (!contact) return null
  return evaluateDnd(contact, channel)
}

export async function checkDndByPhone(
  phone: string | null | undefined,
  channel: SendChannel,
): Promise<string | null> {
  if (!phone) return null
  const contacts = await prisma.contact.findMany({
    where: { OR: [{ phone }, { phone2: phone }] },
    select: { doNotCall: true, doNotText: true, doNotEmail: true },
  })
  for (const c of contacts) {
    const block = evaluateDnd(c, channel)
    if (block) return block
  }
  return null
}

export async function checkDndByEmail(
  email: string | null | undefined,
): Promise<string | null> {
  if (!email) return null
  const contacts = await prisma.contact.findMany({
    where: { email },
    select: { doNotCall: true, doNotText: true, doNotEmail: true },
  })
  for (const c of contacts) {
    const block = evaluateDnd(c, 'email')
    if (block) return block
  }
  return null
}

function evaluateDnd(
  contact: { doNotCall: boolean; doNotText: boolean; doNotEmail: boolean },
  channel: SendChannel,
): string | null {
  if (channel === 'sms' && contact.doNotText) return 'Contact is on Do Not Text list'
  if (channel === 'call' && contact.doNotCall) return 'Contact is on Do Not Call list'
  if (channel === 'email' && contact.doNotEmail) return 'Contact is on Do Not Email list'
  return null
}
