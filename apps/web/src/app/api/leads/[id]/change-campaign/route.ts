import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  Property,
  PropertyTeamAssignment,
  LeadCampaign,
  Task,
  Appointment,
  Op,
  literal,
} from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'
import { reEvaluateTeam } from '@/lib/team-assignment'
import { emitEvent, DomainEvents } from '@/lib/domain-events'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const BodySchema = z.object({
  newCampaignId: z.string().nullable(),
  roleMappings: z.array(
    z.object({
      oldRoleId: z.string().min(1),
      newRoleId: z.string().nullable(),
    }),
  ),
})

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny
  const actorUserId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params
  const body = await req.json()
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const { newCampaignId, roleMappings } = parsed.data

  const existingRow = await Property.findByPk(id, {
    attributes: ['id', 'leadType', 'leadCampaignId'],
    include: [
      { model: PropertyTeamAssignment, as: 'teamAssignments', attributes: ['roleId', 'userId'] },
    ],
  })
  if (!existingRow) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  const existing = existingRow.get({ plain: true }) as any
  if (existing.leadCampaignId === newCampaignId) {
    return NextResponse.json({ success: true, noop: true })
  }

  if (newCampaignId) {
    const lc = await LeadCampaign.findByPk(newCampaignId, { attributes: ['type'], raw: true }) as any
    if (!lc) {
      return NextResponse.json({ error: 'Target campaign not found' }, { status: 422 })
    }
    const expectedType = existing.leadType === 'DIRECT_TO_SELLER' ? 'DTS' : 'DTA'
    if (lc.type && lc.type !== expectedType) {
      return NextResponse.json(
        { error: `Campaign type ${lc.type} does not match lead type ${existing.leadType}` },
        { status: 422 },
      )
    }
  }

  const oldRoleToUser = new Map<string, string>()
  for (const a of (existing.teamAssignments ?? [])) {
    oldRoleToUser.set(a.roleId, a.userId)
  }

  await Property.update({ leadCampaignId: newCampaignId }, { where: { id } })

  await reEvaluateTeam(id, existing.leadCampaignId, newCampaignId, actorUserId)

  const newTeam = await PropertyTeamAssignment.findAll({
    where: { propertyId: id },
    attributes: ['roleId', 'userId'],
    raw: true,
  }) as unknown as Array<{ roleId: string; userId: string }>
  const newRoleToUser = new Map<string, string>()
  for (const a of newTeam) newRoleToUser.set(a.roleId, a.userId)

  let tasksMigrated = 0
  let appointmentsTouched = 0
  for (const m of roleMappings) {
    if (!m.newRoleId) continue
    const oldUserId = oldRoleToUser.get(m.oldRoleId)
    const newUserId = newRoleToUser.get(m.newRoleId)
    if (!oldUserId || !newUserId || oldUserId === newUserId) continue

    const [tCount] = await Task.update(
      { assignedToId: newUserId },
      {
        where: {
          propertyId: id,
          assignedToId: oldUserId,
          status: 'PENDING',
        },
      },
    )
    tasksMigrated += tCount

    const appointments = await Appointment.findAll({
      where: {
        propertyId: id,
        attendees: { [Op.contains]: [oldUserId] },
      },
      attributes: ['id', 'attendees'],
    }) as unknown as Array<{ id: string; attendees: string[]; update: (data: any) => Promise<any> }>
    for (const a of appointments) {
      const plain = (a as any).get({ plain: true }) as { id: string; attendees: string[] }
      const rewritten = (plain.attendees ?? []).map((u) => (u === oldUserId ? newUserId : u))
      const deduped = Array.from(new Set(rewritten))
      await Appointment.update({ attendees: deduped }, { where: { id: plain.id } })
      appointmentsTouched++
    }
  }

  void emitEvent({
    type: DomainEvents.LEAD_UPDATED,
    propertyId: id,
    userId: actorUserId,
    actorType: 'user',
    payload: {
      change: 'campaign_changed',
      fromCampaignId: existing.leadCampaignId,
      toCampaignId: newCampaignId,
      tasksMigrated,
      appointmentsTouched,
    },
  })

  return NextResponse.json({
    success: true,
    tasksMigrated,
    appointmentsTouched,
  })
}
