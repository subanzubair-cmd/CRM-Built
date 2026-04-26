import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { CampaignEnrollment, Campaign, CampaignStep, Property } from '@crm/database'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const enrollments = await CampaignEnrollment.findAll({
    where: { isActive: true, completedAt: null },
    include: [
      {
        model: Campaign,
        as: 'campaign',
        attributes: ['id', 'name'],
        include: [
          { model: CampaignStep, as: 'steps', separate: true, order: [['order', 'ASC']] },
        ],
      },
      {
        model: Property,
        as: 'property',
        attributes: ['id', 'streetAddress', 'city', 'state', 'propertyStatus', 'leadType'],
      },
    ],
    order: [['enrolledAt', 'DESC']],
    limit: 100,
  })

  const result = enrollments.map((row) => {
    const e = row.get({ plain: true }) as any
    const nextStep = (e.campaign?.steps ?? []).find((s: any) => s.order === e.currentStep)
    let nextFireAt: Date | null = null
    if (nextStep) {
      const base = new Date(e.updatedAt)
      nextFireAt = new Date(base.getTime() + nextStep.delayDays * 86400000 + nextStep.delayHours * 3600000)
    }
    return {
      id: e.id,
      campaignId: e.campaignId,
      campaignName: e.campaign?.name,
      propertyId: e.propertyId,
      property: e.property,
      currentStep: e.currentStep,
      totalSteps: (e.campaign?.steps ?? []).length,
      nextChannel: nextStep?.channel ?? null,
      nextFireAt,
      pausedAt: e.pausedAt,
      enrolledAt: e.enrolledAt,
    }
  })

  return NextResponse.json({ sends: result })
}
