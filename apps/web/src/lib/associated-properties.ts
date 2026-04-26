import { PropertyContact, Contact, Property, Op } from '@crm/database'

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

export async function getAssociatedProperties(
  currentPropertyId: string,
): Promise<AssociatedProperty[]> {
  const currentContacts = await PropertyContact.findAll({
    where: { propertyId: currentPropertyId },
    include: [{ model: Contact, as: 'contact', attributes: ['phone', 'phone2'] }],
    raw: true,
    nest: true,
  }) as unknown as Array<{ contact: { phone: string | null; phone2: string | null } }>

  const phones = new Set<string>()
  for (const pc of currentContacts) {
    if (pc.contact?.phone) phones.add(pc.contact.phone)
    if (pc.contact?.phone2) phones.add(pc.contact.phone2)
  }

  if (phones.size === 0) return []
  const phoneList = [...phones]

  const matchingContacts = await PropertyContact.findAll({
    where: {
      propertyId: { [Op.ne]: currentPropertyId },
    },
    include: [
      {
        model: Contact,
        as: 'contact',
        required: true,
        attributes: ['phone', 'phone2'],
        where: {
          [Op.or]: [
            { phone: { [Op.in]: phoneList } },
            { phone2: { [Op.in]: phoneList } },
          ],
        },
      },
      {
        model: Property,
        as: 'property',
        attributes: ['id', 'streetAddress', 'city', 'state', 'leadStatus', 'propertyStatus', 'activeLeadStage'],
      },
    ],
    limit: 60,
  })

  const seen = new Set<string>()
  const results: AssociatedProperty[] = []
  for (const pcRow of matchingContacts) {
    const pc = pcRow.get({ plain: true }) as any
    if (!pc.property || seen.has(pc.property.id)) continue
    seen.add(pc.property.id)
    const matchedPhone = phoneList.find(
      (p) => p === pc.contact?.phone || p === pc.contact?.phone2,
    ) ?? ''
    results.push({ ...pc.property, matchedPhone })
    if (results.length >= 20) break
  }

  return results
}
