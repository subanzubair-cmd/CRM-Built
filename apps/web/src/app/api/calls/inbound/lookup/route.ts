import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/calls/inbound/lookup?phone=+12145550101
 *
 * Looks up a phone number across contacts, properties, and list stacking
 * entries. Used by the Inbound Call Notification popup to identify callers.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  // Find matching contacts by phone or phone2
  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { phone: { equals: phone } },
        { phone2: { equals: phone } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      type: true,
      properties: {
        select: {
          property: {
            select: {
              id: true,
              streetAddress: true,
              city: true,
              state: true,
              propertyStatus: true,
              activeLeadStage: true,
              leadType: true,
              source: true,
              tags: true,
            },
          },
        },
      },
    },
    take: 10,
  })

  // Flatten property references
  const leadProperties = contacts.flatMap((c) =>
    c.properties.map((pc) => pc.property)
  )

  // Deduplicate by property id
  const seen = new Set<string>()
  const uniqueLeads = leadProperties.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  // Find list-stacking properties (tags starting with "list:")
  const listStacking = uniqueLeads
    .filter((p) => (p.tags ?? []).some((t) => t.startsWith('list:')))
    .map((p) => ({
      id: p.id,
      streetAddress: p.streetAddress,
      city: p.city,
      state: p.state,
      lists: (p.tags ?? []).filter((t) => t.startsWith('list:')).map((t) => t.replace('list:', '')),
    }))

  // Caller info from first matching contact
  const caller = contacts[0]
    ? {
        name: `${contacts[0].firstName} ${contacts[0].lastName ?? ''}`.trim(),
        phone: contacts[0].phone,
        type: contacts[0].type,
      }
    : { name: 'Unknown Caller', phone, type: null }

  // Source label — take from most recent lead property
  const source = uniqueLeads[0]?.source ?? null

  // Look up team members assigned to each matched property — these are the
  // users responsible for receiving calls/SMS/email for this lead.
  const propertyIds = uniqueLeads.map((p) => p.id)
  const teamRows = propertyIds.length
    ? await (prisma as any).propertyTeamAssignment.findMany({
        where: { propertyId: { in: propertyIds } },
        include: {
          role: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
      })
    : []

  // Group team rows by property id
  const teamByProperty = new Map<string, Array<{ roleId: string; roleName: string; userId: string; userName: string; userEmail: string; userPhone: string | null }>>()
  for (const t of teamRows as any[]) {
    const arr = teamByProperty.get(t.propertyId) ?? []
    arr.push({
      roleId: t.role?.id ?? t.roleId,
      roleName: t.role?.name ?? '—',
      userId: t.user?.id ?? t.userId,
      userName: t.user?.name ?? '—',
      userEmail: t.user?.email ?? '',
      userPhone: t.user?.phone ?? null,
    })
    teamByProperty.set(t.propertyId, arr)
  }

  return NextResponse.json({
    caller,
    source,
    leadProperties: uniqueLeads.map((p) => ({
      id: p.id,
      streetAddress: p.streetAddress,
      city: p.city,
      state: p.state,
      propertyStatus: p.propertyStatus,
      activeLeadStage: p.activeLeadStage,
      leadType: p.leadType,
      team: teamByProperty.get(p.id) ?? [],
    })),
    listStacking,
  })
}
