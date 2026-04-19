import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
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

/**
 * POST /api/leads/[id]/change-campaign
 *
 * Switches a lead's leadCampaignId AND migrates any open tasks /
 * appointment attendance / (implicit) team assignments from the outgoing
 * campaign's role holders to the incoming campaign's role holders.
 *
 * Flow:
 *   1. Snapshot current PropertyTeamAssignment rows   (oldRoleId → oldUserId)
 *   2. Update Property.leadCampaignId                  — triggers downstream work via reEvaluateTeam
 *   3. reEvaluateTeam populates the new campaign's team
 *   4. Read the fresh PropertyTeamAssignment rows     (newRoleId → newUserId)
 *   5. For each mapping {oldRoleId → newRoleId}, reassign:
 *        - Task.assignedToId from oldUser → newUser
 *        - Appointment.attendees — replace oldUser IDs with newUser IDs
 *   6. Emit a CAMPAIGN_CHANGED event
 */
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

  const existing = await prisma.property.findUnique({
    where: { id },
    select: {
      id: true,
      leadType: true,
      leadCampaignId: true,
      teamAssignments: { select: { roleId: true, userId: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  if (existing.leadCampaignId === newCampaignId) {
    return NextResponse.json({ success: true, noop: true })
  }

  // Validate type match (same check as the main PATCH route)
  if (newCampaignId) {
    const lc = await prisma.leadCampaign.findUnique({
      where: { id: newCampaignId },
      select: { type: true },
    })
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

  // Snapshot role → user BEFORE the re-evaluation
  const oldRoleToUser = new Map<string, string>()
  for (const a of existing.teamAssignments) oldRoleToUser.set(a.roleId, a.userId)

  // 1. Commit the campaign change on the property
  await prisma.property.update({
    where: { id },
    data: { leadCampaignId: newCampaignId },
  })

  // 2. Run re-evaluation — drops obsolete PropertyTeamAssignment rows and
  //    auto-populates the new campaign's enabled roles.
  await reEvaluateTeam(id, existing.leadCampaignId, newCampaignId, actorUserId)

  // 3. Read post-re-evaluation team to figure out the NEW user per new role
  const newTeam = await (prisma as any).propertyTeamAssignment.findMany({
    where: { propertyId: id },
    select: { roleId: true, userId: true },
  }) as Array<{ roleId: string; userId: string }>
  const newRoleToUser = new Map<string, string>()
  for (const a of newTeam) newRoleToUser.set(a.roleId, a.userId)

  // 4. Apply migrations per role mapping
  let tasksMigrated = 0
  let appointmentsTouched = 0
  for (const m of roleMappings) {
    if (!m.newRoleId) continue
    const oldUserId = oldRoleToUser.get(m.oldRoleId)
    const newUserId = newRoleToUser.get(m.newRoleId)
    if (!oldUserId || !newUserId || oldUserId === newUserId) continue

    // Tasks: reassign PENDING tasks on this property from old → new user
    const tRes = await prisma.task.updateMany({
      where: {
        propertyId: id,
        assignedToId: oldUserId,
        status: 'PENDING',
      },
      data: { assignedToId: newUserId },
    })
    tasksMigrated += tRes.count

    // Appointments: attendees is a String[] of user IDs. Find appointments
    // that include the old user and rewrite the array.
    const appointments = await prisma.appointment.findMany({
      where: {
        propertyId: id,
        attendees: { has: oldUserId },
      },
      select: { id: true, attendees: true },
    })
    for (const a of appointments) {
      const rewritten = a.attendees.map((u) => (u === oldUserId ? newUserId : u))
      // Dedupe in case newUserId was already an attendee
      const deduped = Array.from(new Set(rewritten))
      await prisma.appointment.update({
        where: { id: a.id },
        data: { attendees: deduped },
      })
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
