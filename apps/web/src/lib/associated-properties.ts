// apps/web/src/lib/associated-properties.ts
import { prisma } from '@/lib/prisma'

export interface AssociatedProperty {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  leadStatus: string
  propertyStatus: string
  activeLeadStage: string | null
  matchedPhone: string
}

/**
 * Returns properties (excluding currentPropertyId) that share a phone number
 * with any contact on the current property.
 */
export async function getAssociatedProperties(
  currentPropertyId: string
): Promise<AssociatedProperty[]> {
  // Step 1: get all phone numbers from contacts linked to the current property
  const currentContacts = await prisma.propertyContact.findMany({
    where: { propertyId: currentPropertyId },
    select: { contact: { select: { phone: true, phone2: true } } },
  })

  const phones = new Set<string>()
  for (const pc of currentContacts) {
    if (pc.contact.phone) phones.add(pc.contact.phone)
    if (pc.contact.phone2) phones.add(pc.contact.phone2)
  }

  if (phones.size === 0) return []

  // Step 2: find contacts with matching phones, get their linked properties
  const matchingContacts = await prisma.propertyContact.findMany({
    where: {
      contact: {
        OR: [
          { phone: { in: [...phones] } },
          { phone2: { in: [...phones] } },
        ],
      },
      propertyId: { not: currentPropertyId },
    },
    select: {
      property: {
        select: {
          id: true,
          streetAddress: true,
          city: true,
          state: true,
          leadStatus: true,
          propertyStatus: true,
          activeLeadStage: true,
        },
      },
      contact: { select: { phone: true, phone2: true } },
    },
    distinct: ['propertyId'],
    take: 20,
  })

  const seen = new Set<string>()
  const results: AssociatedProperty[] = []
  for (const pc of matchingContacts) {
    if (!pc.property || seen.has(pc.property.id)) continue
    seen.add(pc.property.id)
    const matchedPhone = [...phones].find(
      (p) => p === pc.contact.phone || p === pc.contact.phone2
    ) ?? ''
    results.push({ ...pc.property, matchedPhone })
  }

  return results
}
