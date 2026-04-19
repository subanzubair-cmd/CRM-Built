import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const BackfillSchema = z.object({
  campaignId: z.string().min(1),
})

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'users.manage')
  if (deny) return deny
  const { id: userId } = await params

  const body = await req.json()
  const parsed = BackfillSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const campaign = await prisma.campaign.findUnique({
    where: { id: parsed.data.campaignId },
    select: { name: true },
  })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  // Reassign unassigned active leads in this campaign to this user
  const result = await prisma.property.updateMany({
    where: {
      campaignName: campaign.name,
      assignedToId: null,
      leadStatus: 'ACTIVE',
    },
    data: { assignedToId: userId },
  })

  // Mark backfill completed on the assignment row
  await prisma.userCampaignAssignment.updateMany({
    where: { userId, campaignId: parsed.data.campaignId },
    data: { backfillExistingLeads: true },
  })

  return NextResponse.json({ success: true, backfilledCount: result.count })
}
