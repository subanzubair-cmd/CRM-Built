import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'
import { Campaign, CAMPAIGN_MODULE_VALUES } from '@crm/database'
import { getCampaignById } from '@/lib/campaigns'

/**
 * Carry-forward from QA audit (#2 Critical): all mutations on a
 * campaign must require `campaigns.manage`. Previously PATCH/DELETE
 * only checked `session?.user`, which let any signed-in user
 * archive / delete any campaign + cascade-wipe its enrollments.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Read access uses `campaigns.view` (the same gate the list endpoint
  // uses). Mutations stay on `campaigns.manage` (PATCH/DELETE below).
  const session = await auth()
  const deny = requirePermission(session, 'campaigns.view')
  if (deny) return deny

  const { id } = await params
  const campaign = await getCampaignById(id)
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(campaign)
}

const UpdateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
  module: z.enum(CAMPAIGN_MODULE_VALUES as [string, ...string[]]).optional(),
  description: z.string().optional(),
  marketId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  leadTypes: z.array(z.enum(['DIRECT_TO_SELLER', 'DIRECT_TO_AGENT'])).optional(),
  aiEnabled: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const deny = requirePermission(session, 'campaigns.manage')
  if (deny) return deny

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateCampaignSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const campaign = await Campaign.findByPk(id)
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await campaign.update(parsed.data as any)
  return NextResponse.json(campaign)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const deny = requirePermission(session, 'campaigns.manage')
  if (deny) return deny

  const { id } = await params
  const campaign = await Campaign.findByPk(id)
  if (!campaign) return new NextResponse(null, { status: 204 })
  await campaign.destroy()
  return new NextResponse(null, { status: 204 })
}
