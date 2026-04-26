import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { CampaignEnrollment, Campaign, CampaignStep, Property } from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'

export async function GET() {
  const session = await auth()
  const deny = requirePermission(session, 'leads.view')
  if (deny) return deny

  const enrollments = await CampaignEnrollment.findAll({
    where: {
      isActive: true,
      completedAt: null,
    },
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
    order: [['enrolledAt', 'ASC']],
    limit: 200,
  })

  const items = enrollments.map((row) => {
    const e = row.get({ plain: true }) as any
    const nextStep = (e.campaign?.steps ?? []).find((s: any) => s.order === e.currentStep)
    let scheduledAt: string | null = null
    if (nextStep) {
      const fireTime = new Date(
        new Date(e.updatedAt).getTime() +
          nextStep.delayDays * 86400000 +
          nextStep.delayHours * 3600000,
      )
      scheduledAt = fireTime.toISOString()
    }

    return {
      id: e.id,
      campaignName: e.campaign?.name,
      propertyId: e.property?.id,
      propertyAddress: [e.property?.streetAddress, e.property?.city, e.property?.state]
        .filter(Boolean)
        .join(', '),
      currentStep: e.currentStep,
      totalSteps: (e.campaign?.steps ?? []).length,
      nextStepContent: nextStep?.body ?? '',
      scheduledAt,
      channel: nextStep?.channel ?? 'SMS',
      pausedAt: e.pausedAt,
      propertyStatus: e.property?.propertyStatus,
      leadType: e.property?.leadType,
    }
  })

  return NextResponse.json({ data: items })
}
