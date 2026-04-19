import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'

export async function GET() {
  const session = await auth()
  const deny = requirePermission(session, 'leads.view')
  if (deny) return deny

  const enrollments = await prisma.campaignEnrollment.findMany({
    where: {
      isActive: true,
      completedAt: null,
    },
    include: {
      campaign: {
        select: {
          id: true,
          name: true,
          steps: { orderBy: { order: 'asc' } },
        },
      },
      property: {
        select: { id: true, streetAddress: true, city: true, state: true, propertyStatus: true, leadType: true },
      },
    },
    orderBy: { enrolledAt: 'asc' },
    take: 200,
  })

  const items = enrollments.map((e) => {
    const nextStep = e.campaign.steps.find((s) => s.order === e.currentStep)
    // Calculate approximate fire time based on updatedAt + next step delay
    let scheduledAt: string | null = null
    if (nextStep) {
      const fireTime = new Date(
        e.updatedAt.getTime() +
          nextStep.delayDays * 86400000 +
          nextStep.delayHours * 3600000,
      )
      scheduledAt = fireTime.toISOString()
    }

    return {
      id: e.id,
      campaignName: e.campaign.name,
      propertyId: e.property.id,
      propertyAddress: [e.property.streetAddress, e.property.city, e.property.state]
        .filter(Boolean)
        .join(', '),
      currentStep: e.currentStep,
      totalSteps: e.campaign.steps.length,
      nextStepContent: nextStep?.body ?? '',
      scheduledAt,
      channel: nextStep?.channel ?? 'SMS',
      pausedAt: e.pausedAt,
      propertyStatus: e.property.propertyStatus,
      leadType: e.property.leadType,
    }
  })

  return NextResponse.json({ data: items })
}
