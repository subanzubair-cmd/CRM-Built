import { prisma } from '@/lib/prisma'

export type SendChannel = 'sms' | 'call' | 'email'

/**
 * Checks whether a send is allowed to a contact over the given channel.
 * Honors Contact.doNotText / doNotCall / doNotEmail. Returns a reason string
 * if the send is blocked, otherwise null.
 *
 * Callers should treat a non-null reason as a hard stop and log the block
 * (e.g. activityLog with action 'DND_BLOCKED' so compliance can audit).
 */
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

/**
 * Same as checkDndByContactId but resolves contact by phone number. Used by
 * outbound SMS/call paths that only have a phone (e.g. drip campaigns).
 */
export async function checkDndByPhone(
  phone: string | null | undefined,
  channel: SendChannel,
): Promise<string | null> {
  if (!phone) return null
  const contacts = await prisma.contact.findMany({
    where: {
      OR: [{ phone }, { phone2: phone }],
    },
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
