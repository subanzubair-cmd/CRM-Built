import { Contact, Op } from '@crm/database'

export type SendChannel = 'sms' | 'call' | 'email'

export async function checkDndByContactId(
  contactId: string | null | undefined,
  channel: SendChannel,
): Promise<string | null> {
  if (!contactId) return null
  const contact = await Contact.findByPk(contactId, {
    attributes: ['doNotCall', 'doNotText', 'doNotEmail'],
  })
  if (!contact) return null
  return evaluateDnd(contact, channel)
}

export async function checkDndByPhone(
  phone: string | null | undefined,
  channel: SendChannel,
): Promise<string | null> {
  if (!phone) return null
  const contacts = await Contact.findAll({
    where: { [Op.or]: [{ phone }, { phone2: phone }] },
    attributes: ['doNotCall', 'doNotText', 'doNotEmail'],
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
  const contacts = await Contact.findAll({
    where: { email },
    attributes: ['doNotCall', 'doNotText', 'doNotEmail'],
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
