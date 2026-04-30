import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { Campaign, CampaignStep, sequelize } from '@crm/database'

/**
 * POST /api/campaigns/[id]/clone
 *
 * Duplicate a drip campaign + every step. The clone starts in `DRAFT`
 * status with " (Copy)" appended to the name; enrollments are NOT
 * carried over (a copied campaign should re-enroll fresh subjects on
 * its own schedule). Both the campaign INSERT and the step bulk
 * INSERT run inside one transaction so a half-cloned row never gets
 * left behind.
 *
 * Permissions: requires `campaigns.manage` (matches every other
 * mutating route in this surface).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'campaigns.manage')
  if (deny) return deny

  const { id } = await params
  const original = await Campaign.findByPk(id)
  if (!original) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const steps = await CampaignStep.findAll({
    where: { campaignId: id },
    order: [['order', 'ASC']],
  })

  const clone = await sequelize.transaction(async (t) => {
    const cloned = await Campaign.create(
      {
        name: `${original.name} (Copy)`,
        type: original.type,
        // The clone starts paused in DRAFT so the user can review
        // before re-activating — copying ACTIVE campaigns and having
        // them immediately fire on enroll would be a foot-gun.
        status: 'DRAFT',
        module: (original as any).module ?? 'LEADS',
        description: (original as any).description ?? null,
        marketId: (original as any).marketId ?? null,
        tags: ((original as any).tags ?? []) as any,
        leadTypes: ((original as any).leadTypes ?? []) as any,
        aiEnabled: (original as any).aiEnabled ?? false,
      } as any,
      { transaction: t },
    )

    if (steps.length > 0) {
      const stepRows = steps.map((s) => {
        const json = s.toJSON() as any
        delete json.id
        delete json.campaignId
        delete json.createdAt
        delete json.updatedAt
        return { ...json, campaignId: cloned.id }
      })
      await CampaignStep.bulkCreate(stepRows as any, { transaction: t })
    }

    return cloned
  })

  return NextResponse.json(clone, { status: 201 })
}
