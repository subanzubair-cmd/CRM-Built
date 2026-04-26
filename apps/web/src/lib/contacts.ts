import { prisma } from '@/lib/prisma'
import { Contact, Op } from '@crm/database'

export interface AddContactInput {
  firstName: string
  lastName?: string | null
  phone?: string | null
  email?: string | null
  contactType?: 'SELLER' | 'BUYER' | 'AGENT' | 'VENDOR' | 'OTHER'
  role?: string | null
  isPrimary?: boolean
  preferredChannel?: string | null
}

export interface UpdateContactInput {
  firstName?: string
  lastName?: string | null
  phone?: string | null
  email?: string | null
  contactType?: 'SELLER' | 'BUYER' | 'AGENT' | 'VENDOR' | 'OTHER'
  role?: string | null
  isPrimary?: boolean
  doNotCall?: boolean
  doNotText?: boolean
  preferredChannel?: string | null
}

export async function addContactToProperty(
  propertyId: string,
  data: AddContactInput
) {
  const { firstName, lastName, phone, email, contactType = 'SELLER', role, isPrimary = false, preferredChannel } = data

  // PropertyContact still on Prisma until Phase 6.
  if (isPrimary) {
    await prisma.propertyContact.updateMany({
      where: { propertyId, isPrimary: true },
      data: { isPrimary: false },
    })
  }

  const contact = await Contact.create({
    firstName,
    ...(lastName != null && { lastName }),
    ...(phone != null && { phone }),
    ...(email != null && { email }),
    type: contactType,
    ...(preferredChannel != null && { preferredChannel }),
  })

  const propertyContact = await prisma.propertyContact.create({
    data: {
      propertyId,
      contactId: contact.id,
      ...(role != null && { role }),
      isPrimary,
    },
  })

  return { contact, propertyContact }
}

export async function updatePropertyContact(
  propertyId: string,
  contactId: string,
  data: UpdateContactInput
) {
  if (data.isPrimary) {
    await prisma.propertyContact.updateMany({
      where: { propertyId, isPrimary: true, contactId: { not: contactId } },
      data: { isPrimary: false },
    })
  }

  const contactUpdates: Record<string, unknown> = {}
  if (data.firstName !== undefined) contactUpdates.firstName = data.firstName
  if (data.lastName !== undefined) contactUpdates.lastName = data.lastName
  if (data.phone !== undefined) contactUpdates.phone = data.phone
  if (data.email !== undefined) contactUpdates.email = data.email
  if (data.contactType !== undefined) contactUpdates.type = data.contactType
  if (data.doNotCall !== undefined) contactUpdates.doNotCall = data.doNotCall
  if (data.doNotText !== undefined) contactUpdates.doNotText = data.doNotText
  if (data.preferredChannel !== undefined) contactUpdates.preferredChannel = data.preferredChannel

  const pcUpdates: Record<string, unknown> = {}
  if (data.role !== undefined) pcUpdates.role = data.role
  if (data.isPrimary !== undefined) pcUpdates.isPrimary = data.isPrimary

  await Promise.all([
    Object.keys(contactUpdates).length > 0
      ? Contact.update(contactUpdates as any, { where: { id: contactId } })
      : Promise.resolve(),
    Object.keys(pcUpdates).length > 0
      ? prisma.propertyContact.updateMany({ where: { propertyId, contactId }, data: pcUpdates })
      : Promise.resolve(),
  ])
}

export async function removeContactFromProperty(
  propertyId: string,
  contactId: string
) {
  await prisma.propertyContact.deleteMany({
    where: { propertyId, contactId },
  })
}
