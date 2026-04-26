import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  Contact,
  PropertyContact,
  PropertyTeamAssignment,
  Property,
  Role,
  User,
  Op,
} from '@crm/database'
import { phoneVariants } from '@crm/shared'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  // Match across every phone format variant — until legacy contacts
  // are migrated to E.164, a Telnyx hit of "+14697997747" must still
  // find a contact stored as "4697997747" or "(469) 799-7747".
  const variants = phoneVariants(phone)
  const contactRows = await Contact.findAll({
    where: {
      [Op.or]: [
        { phone: { [Op.in]: variants } },
        { phone2: { [Op.in]: variants } },
      ],
    },
    attributes: ['id', 'firstName', 'lastName', 'phone', 'type'],
    include: [
      {
        model: PropertyContact,
        as: 'properties',
        include: [
          {
            model: Property,
            as: 'property',
            attributes: [
              'id', 'streetAddress', 'city', 'state',
              'propertyStatus', 'activeLeadStage', 'leadType',
              'source', 'tags',
            ],
          },
        ],
      },
    ],
    limit: 10,
  })

  const contacts = contactRows.map((c) => c.get({ plain: true }) as any)

  const leadProperties = contacts.flatMap((c: any) =>
    (c.properties ?? []).map((pc: any) => pc.property).filter(Boolean),
  )

  const seen = new Set<string>()
  const uniqueLeads = leadProperties.filter((p: any) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  const listStacking = uniqueLeads
    .filter((p: any) => (p.tags ?? []).some((t: string) => t.startsWith('list:')))
    .map((p: any) => ({
      id: p.id,
      streetAddress: p.streetAddress,
      city: p.city,
      state: p.state,
      lists: (p.tags ?? []).filter((t: string) => t.startsWith('list:')).map((t: string) => t.replace('list:', '')),
    }))

  const caller = contacts[0]
    ? {
        name: `${contacts[0].firstName} ${contacts[0].lastName ?? ''}`.trim(),
        phone: contacts[0].phone,
        type: contacts[0].type,
      }
    : { name: 'Unknown Caller', phone, type: null }

  const source = uniqueLeads[0]?.source ?? null

  const propertyIds = uniqueLeads.map((p: any) => p.id)
  const teamRows = propertyIds.length
    ? await PropertyTeamAssignment.findAll({
        where: { propertyId: { [Op.in]: propertyIds } },
        include: [
          { model: Role, as: 'role', attributes: ['id', 'name'] },
          { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] },
        ],
      })
    : []
  const teamPlain = teamRows.map((t) => t.get({ plain: true }) as any)

  const teamByProperty = new Map<string, Array<{ roleId: string; roleName: string; userId: string; userName: string; userEmail: string; userPhone: string | null }>>()
  for (const t of teamPlain) {
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
    leadProperties: uniqueLeads.map((p: any) => ({
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
