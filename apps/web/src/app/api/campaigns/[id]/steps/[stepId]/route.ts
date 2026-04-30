import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { Campaign, CampaignStep } from '@crm/database'
import {
  StepFieldsPatchSchema,
  assertActionTypesMatch,
} from '@/lib/campaign-step-schema'

/**
 * PATCH/DELETE on a specific CampaignStep. Both gated by
 * `campaigns.manage` and rejected when the parent campaign is
 * COMPLETED / ARCHIVED.
 */

async function loadAndGuardCampaign(campaignId: string) {
  const campaign = (await Campaign.findByPk(campaignId, {
    attributes: ['id', 'status'],
    raw: true,
  })) as { id: string; status: string } | null
  if (!campaign) {
    return {
      error: NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 },
      ),
    }
  }
  if (campaign.status === 'COMPLETED' || campaign.status === 'ARCHIVED') {
    return {
      error: NextResponse.json(
        {
          error: `Cannot edit steps on a ${campaign.status} campaign — clone it instead.`,
        },
        { status: 422 },
      ),
    }
  }
  return { campaign }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'campaigns.manage')
  if (deny) return deny

  const { id: campaignId, stepId } = await params
  const guard = await loadAndGuardCampaign(campaignId)
  if (guard.error) return guard.error

  const body = await req.json()
  const parsed = StepFieldsPatchSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // If the patch touches both, the discriminator must match.
  try {
    assertActionTypesMatch(parsed.data.actionType, parsed.data.config as any)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid step' },
      { status: 400 },
    )
  }

  // DRIP_ENROLL self-cycle protection (same as POST /steps).
  if (
    parsed.data.config?.actionType === 'DRIP_ENROLL' &&
    parsed.data.config.targetCampaignId === campaignId
  ) {
    return NextResponse.json(
      { error: 'A drip campaign cannot enroll subjects into itself.' },
      { status: 422 },
    )
  }

  const [count] = await CampaignStep.update(parsed.data as any, {
    where: { id: stepId, campaignId },
  })
  if (count === 0) {
    return NextResponse.json({ error: 'Step not found' }, { status: 404 })
  }

  const updated = await CampaignStep.findByPk(stepId)
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'campaigns.manage')
  if (deny) return deny

  const { id: campaignId, stepId } = await params
  const guard = await loadAndGuardCampaign(campaignId)
  if (guard.error) return guard.error

  const deletedCount = await CampaignStep.destroy({
    where: { id: stepId, campaignId },
  })
  if (deletedCount === 0) {
    return NextResponse.json({ error: 'Step not found' }, { status: 404 })
  }

  // Re-order remaining steps so `order` stays gap-free.
  const remaining = await CampaignStep.findAll({
    where: { campaignId },
    order: [['order', 'ASC']],
    attributes: ['id'],
  })
  await Promise.all(
    remaining.map((s, idx) =>
      CampaignStep.update({ order: idx + 1 }, { where: { id: s.id } }),
    ),
  )

  return new NextResponse(null, { status: 204 })
}
