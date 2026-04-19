import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const AssignmentSchema = z.object({
  campaignId: z.string().min(1),
  roleId: z.string().min(1),
  assignNewLeads: z.boolean().default(false),
  backfillExistingLeads: z.boolean().default(false),
})

const UpsertBodySchema = z.object({
  assignments: z.array(AssignmentSchema),
})

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'users.view')
  if (deny) return deny
  const { id } = await params

  const assignments = await prisma.userCampaignAssignment.findMany({
    where: { userId: id },
    include: {
      campaign: { select: { id: true, name: true, isActive: true, type: true } },
      role: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ data: assignments })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'users.manage')
  if (deny) return deny
  const { id: userId } = await params

  const body = await req.json()
  const parsed = UpsertBodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { assignments } = parsed.data

  // Delete assignments not in the new list
  const keepKeys = assignments.map((a) => `${a.campaignId}|${a.roleId}`)
  const existing = await prisma.userCampaignAssignment.findMany({
    where: { userId },
    select: { id: true, campaignId: true, roleId: true },
  })
  const toDelete = existing.filter((e) => !keepKeys.includes(`${e.campaignId}|${e.roleId}`))
  if (toDelete.length > 0) {
    await prisma.userCampaignAssignment.deleteMany({
      where: { id: { in: toDelete.map((t) => t.id) } },
    })
  }

  // Upsert each
  for (const a of assignments) {
    await prisma.userCampaignAssignment.upsert({
      where: {
        userId_roleId_campaignId: {
          userId,
          roleId: a.roleId,
          campaignId: a.campaignId,
        },
      },
      create: {
        userId,
        roleId: a.roleId,
        campaignId: a.campaignId,
        assignNewLeads: a.assignNewLeads,
        backfillExistingLeads: a.backfillExistingLeads,
      },
      update: {
        assignNewLeads: a.assignNewLeads,
        backfillExistingLeads: a.backfillExistingLeads,
      },
    })
  }

  return NextResponse.json({ success: true })
}
