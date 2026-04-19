import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const [properties, contacts, messages, notes, tasks, files] = await Promise.all([
    // Properties — address fields
    prisma.property.findMany({
      where: {
        OR: [
          { streetAddress: { contains: q, mode: 'insensitive' } },
          { normalizedAddress: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        streetAddress: true,
        city: true,
        state: true,
        zip: true,
        propertyStatus: true,
        leadType: true,
      },
      take: 5,
    }),

    // Contacts — name, phone, email
    prisma.contact.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        properties: {
          select: {
            property: {
              select: { id: true, streetAddress: true, propertyStatus: true, leadType: true },
            },
          },
          take: 1,
        },
      },
      take: 5,
    }),

    // Messages — body
    prisma.message.findMany({
      where: { body: { contains: q, mode: 'insensitive' } },
      select: {
        id: true,
        body: true,
        channel: true,
        createdAt: true,
        property: {
          select: { id: true, streetAddress: true, propertyStatus: true, leadType: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),

    // Notes — body
    prisma.note.findMany({
      where: { body: { contains: q, mode: 'insensitive' } },
      select: {
        id: true,
        body: true,
        createdAt: true,
        property: {
          select: { id: true, streetAddress: true, propertyStatus: true, leadType: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),

    // Tasks — title
    prisma.task.findMany({
      where: { title: { contains: q, mode: 'insensitive' } },
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
        property: {
          select: { id: true, streetAddress: true, propertyStatus: true, leadType: true },
        },
      },
      take: 3,
    }),

    // PropertyFiles — name
    prisma.propertyFile.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        type: true,
        property: {
          select: { id: true, streetAddress: true, propertyStatus: true, leadType: true },
        },
      },
      take: 3,
    }),
  ])

  return NextResponse.json({
    results: {
      properties,
      contacts,
      messages,
      notes,
      tasks,
      files,
    },
  })
}
