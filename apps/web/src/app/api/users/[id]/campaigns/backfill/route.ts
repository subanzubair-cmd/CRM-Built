import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Property, Campaign, UserCampaignAssignment } from '@crm/database'
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

  const campaign = await Campaign.findByPk(parsed.data.campaignId, {
    attributes: ['name'],
    raw: true,
  }) as any
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const [count] = await Property.update(
    { assignedToId: userId },
    {
      where: {
        campaignName: campaign.name,
        assignedToId: null,
        leadStatus: 'ACTIVE',
      },
    },
  )

  await UserCampaignAssignment.update(
    { backfillExistingLeads: true },
    { where: { userId, campaignId: parsed.data.campaignId } },
  )

  return NextResponse.json({ success: true, backfilledCount: count })
}
