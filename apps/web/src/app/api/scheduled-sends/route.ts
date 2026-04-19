import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Active enrollments that haven't completed
  const enrollments = await prisma.campaignEnrollment.findMany({
    where: { isActive: true, completedAt: null },
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
    orderBy: { enrolledAt: 'desc' },
    take: 100,
  })

  // Calculate next fire time for each enrollment
  const result = enrollments.map((e) => {
    const nextStep = e.campaign.steps.find((s) => s.order === e.currentStep)
    let nextFireAt: Date | null = null
    if (nextStep) {
      const base = e.updatedAt
      nextFireAt = new Date(base.getTime() + nextStep.delayDays * 86400000 + nextStep.delayHours * 3600000)
    }
    return {
      id: e.id,
      campaignId: e.campaignId,
      campaignName: e.campaign.name,
      propertyId: e.propertyId,
      property: e.property,
      currentStep: e.currentStep,
      totalSteps: e.campaign.steps.length,
      nextChannel: nextStep?.channel ?? null,
      nextFireAt,
      pausedAt: e.pausedAt,
      enrolledAt: e.enrolledAt,
    }
  })

  return NextResponse.json({ sends: result })
}
