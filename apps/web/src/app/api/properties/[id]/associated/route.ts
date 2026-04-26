import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  PropertyContact,
  Contact,
  Property,
  Op,
  literal,
} from '@crm/database'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Pull all phone numbers belonging to contacts on THIS property.
  const propertyContacts = await PropertyContact.findAll({
    where: { propertyId: id },
    include: [
      { model: Contact, as: 'contact', attributes: ['phone', 'phone2'] },
    ],
    raw: true,
    nest: true,
  })

  const phones = (propertyContacts as unknown as Array<{ contact: { phone: string | null; phone2: string | null } }>)
    .flatMap((pc) => [pc.contact?.phone, pc.contact?.phone2].filter((p): p is string => Boolean(p)))

  if (phones.length === 0) return NextResponse.json({ associated: [] })

  // Use an EXISTS subquery on PropertyContact + Contact to find the OTHER
  // properties whose contacts share any of these phone numbers. Replaces
  // Prisma's nested `contacts: { some: { contact: { OR: ... } } }`.
  const escapedPhones = phones.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')
  const associated = await Property.findAll({
    where: {
      id: {
        [Op.ne]: id,
        [Op.in]: literal(
          `(SELECT pc."propertyId" FROM "PropertyContact" pc JOIN "Contact" c ON c."id" = pc."contactId" WHERE c."phone" IN (${escapedPhones}) OR c."phone2" IN (${escapedPhones}))`,
        ),
      },
    },
    attributes: [
      'id',
      'streetAddress',
      'city',
      'state',
      'propertyStatus',
      'leadType',
      'activeLeadStage',
    ],
    include: [
      {
        model: PropertyContact,
        as: 'contacts',
        where: { isPrimary: true },
        required: false,
        limit: 1,
        include: [
          {
            model: Contact,
            as: 'contact',
            attributes: ['firstName', 'lastName', 'phone'],
          },
        ],
      },
    ],
    limit: 10,
    subQuery: false,
  })

  const plain = associated.map((p) => p.get({ plain: true }))
  return NextResponse.json({ associated: plain })
}
