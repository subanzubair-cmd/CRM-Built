import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'
import { Campaign, CampaignStep, sequelize } from '@crm/database'
import {
  StepFieldsSchema,
  assertActionTypesMatch,
} from '@/lib/campaign-step-schema'

/**
 * /api/campaigns/[id]/steps
 *   POST   create one step (auto-orders to last + 1)
 *   PUT    reorder all steps (orderedIds[])
 *   DELETE remove one step
 *
 * All mutations require `campaigns.manage` (carry-forward QA #2).
 *
 * Status guard: writes are rejected when the campaign is COMPLETED
 * or ARCHIVED. Editing those is almost always a mistake — once a
 * campaign is closed, the right move is to clone it, not modify it.
 */

const DeleteStepSchema = z.object({ stepId: z.string().min(1) })
const ReorderSchema = z.object({ orderedIds: z.array(z.string().min(1)).min(1) })

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'campaigns.manage')
  if (deny) return deny

  const { id: campaignId } = await params
  const guard = await loadAndGuardCampaign(campaignId)
  if (guard.error) return guard.error

  const body = await req.json()
  const parsed = StepFieldsSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    assertActionTypesMatch(parsed.data.actionType, parsed.data.config as any)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid step' },
      { status: 400 },
    )
  }

  // DRIP_ENROLL cycle protection — refuse a step that enrolls into
  // the campaign it's part of. (Cross-campaign cycles can still be
  // built; we accept that since it's a less common foot-gun and
  // would require a graph walk to detect.)
  if (parsed.data.config.actionType === 'DRIP_ENROLL') {
    if (parsed.data.config.targetCampaignId === campaignId) {
      return NextResponse.json(
        { error: 'A drip campaign cannot enroll subjects into itself.' },
        { status: 422 },
      )
    }
  }

  const lastStep = await CampaignStep.findOne({
    where: { campaignId },
    order: [['order', 'DESC']],
    attributes: ['order'],
  })
  const order = (lastStep?.order ?? 0) + 1

  const step = await CampaignStep.create({
    campaignId,
    order,
    actionType: parsed.data.actionType as any,
    delayAmount: parsed.data.delayAmount,
    delayUnit: parsed.data.delayUnit as any,
    skipWeekendsAndHolidays: parsed.data.skipWeekendsAndHolidays,
    isActive: parsed.data.isActive,
    config: parsed.data.config as any,
    // Legacy column defaults — kept satisfied so the row is valid
    // until the legacy columns are dropped in a follow-up migration.
    delayDays: 0,
    delayHours: 0,
    channel: legacyChannelFor(parsed.data.actionType) as any,
    body: legacyBodyFor(parsed.data.config),
  } as any)

  return NextResponse.json(step, { status: 201 })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'campaigns.manage')
  if (deny) return deny

  const { id: campaignId } = await params
  const guard = await loadAndGuardCampaign(campaignId)
  if (guard.error) return guard.error

  const body = await req.json()
  const parsed = ReorderSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  await sequelize.transaction((t) =>
    Promise.all(
      parsed.data.orderedIds.map((id, idx) =>
        CampaignStep.update(
          { order: idx + 1 },
          { where: { id, campaignId }, transaction: t },
        ),
      ),
    ),
  )

  const steps = await CampaignStep.findAll({
    where: { campaignId },
    order: [['order', 'ASC']],
  })
  return NextResponse.json(steps)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'campaigns.manage')
  if (deny) return deny

  const { id: campaignId } = await params
  const guard = await loadAndGuardCampaign(campaignId)
  if (guard.error) return guard.error

  const body = await req.json()
  const parsed = DeleteStepSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  await CampaignStep.destroy({
    where: { id: parsed.data.stepId, campaignId },
  })

  return new NextResponse(null, { status: 204 })
}

/**
 * Map a new actionType back onto the legacy `channel` column so old
 * code reading `step.channel` still gets a sensible value during
 * the deprecation window. EMAIL → 'EMAIL'; everything else → 'SMS'.
 */
function legacyChannelFor(actionType: string): string {
  return actionType === 'EMAIL' ? 'EMAIL' : 'SMS'
}

/**
 * Best-effort backfill of the legacy `body` column for SMS / EMAIL
 * configs so the existing executor keeps working until it switches
 * over. Other action types get an empty string.
 */
function legacyBodyFor(config: any): string {
  if (!config || typeof config !== 'object') return ''
  if (config.actionType === 'SMS' || config.actionType === 'EMAIL') {
    return typeof config.body === 'string' ? config.body : ''
  }
  return ''
}
