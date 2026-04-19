import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Get all phone numbers from contacts on this property
  const propertyContacts = await prisma.propertyContact.findMany({
    where: { propertyId: id },
    select: { contact: { select: { phone: true, phone2: true } } },
  })

  const phones = propertyContacts.flatMap((pc) =>
    [pc.contact.phone, pc.contact.phone2].filter((p): p is string => Boolean(p))
  )

  if (phones.length === 0) return NextResponse.json({ associated: [] })

  // Find other properties that have any contact with a matching phone
  const associated = await prisma.property.findMany({
    where: {
      id: { not: id },
      contacts: {
        some: {
          contact: {
            OR: [
              { phone: { in: phones } },
              { phone2: { in: phones } },
            ],
          },
        },
      },
    },
    select: {
      id: true,
      streetAddress: true,
      city: true,
      state: true,
      propertyStatus: true,
      leadType: true,
      activeLeadStage: true,
      contacts: {
        where: { isPrimary: true },
        select: { contact: { select: { firstName: true, lastName: true, phone: true } } },
        take: 1,
      },
    },
    take: 10,
  })

  return NextResponse.json({ associated })
}
