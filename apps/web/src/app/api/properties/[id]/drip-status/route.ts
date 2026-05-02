import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Campaign, CampaignEnrollment, CampaignStep } from '@crm/database'

type Params = { params: Promise<{ id: string }> }

function addDelay(date: Date, amount: number, unit: string): Date {
  const d = new Date(date)
  switch (unit) {
    case 'MINUTES': d.setMinutes(d.getMinutes() + amount); break
    case 'HOURS':   d.setHours(d.getHours() + amount); break
    case 'DAYS':    d.setDate(d.getDate() + amount); break
    case 'WEEKS':   d.setDate(d.getDate() + amount * 7); break
    case 'MONTHS':  d.setMonth(d.getMonth() + amount); break
  }
  return d
}

/** Map actionType → short label used in stats grid */
const ACTION_STAT_KEY: Record<string, string> = {
  SMS:           'smsSent',
  EMAIL:         'emailSent',
  TASK:          'taskCreated',
  WEBHOOK:       'webhookFired',
  TAG_CHANGE:    'tagChanged',
  STATUS_CHANGE: 'statusChanged',
  DRIP_ENROLL:   'dripEnroll',
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: propertyId } = await params

  const enrollments = await CampaignEnrollment.findAll({
    where: { propertyId, isActive: true } as any,
    include: [
      {
        model: Campaign,
        as: 'campaign',
        include: [
          {
            model: CampaignStep,
            as: 'steps',
            where: { isActive: true },
            required: false,
          },
        ],
      },
    ],
    order: [['enrolledAt', 'DESC']],
    limit: 5,
  })

  const data = enrollments.map((enrollment) => {
    const campaign = (enrollment as any).campaign as any
    const rawSteps: any[] = campaign?.steps ?? []
    const sortedSteps = [...rawSteps].sort((a, b) => a.order - b.order)

    // Compute per-step scheduled dates.
    // Step 0 fires at firstStepAt (explicit override) or enrolledAt + step0.delay.
    // Each subsequent step fires at previous step's time + its own delay.
    const stepsWithDates = sortedSteps.map((step: any, idx: number) => {
      return { step, idx }
    }).reduce<{ step: any; idx: number; scheduledAt: Date }[]>((acc, { step, idx }) => {
      let scheduledAt: Date
      if (idx === 0) {
        scheduledAt = enrollment.firstStepAt
          ? new Date(enrollment.firstStepAt)
          : addDelay(new Date(enrollment.enrolledAt), step.delayAmount ?? 0, step.delayUnit ?? 'DAYS')
      } else {
        const prevTime = acc[idx - 1].scheduledAt
        scheduledAt = addDelay(new Date(prevTime), step.delayAmount ?? 0, step.delayUnit ?? 'DAYS')
      }
      return [...acc, { step, idx, scheduledAt }]
    }, [])

    // Stats: count each action type among completed steps (order < currentStep)
    const stats: Record<string, number> = {
      smsSent: 0, emailSent: 0, taskCreated: 0,
      webhookFired: 0, tagChanged: 0, statusChanged: 0, dripEnroll: 0,
    }
    for (const { step } of stepsWithDates) {
      if (step.order < enrollment.currentStep) {
        const key = ACTION_STAT_KEY[step.actionType]
        if (key) stats[key] = (stats[key] ?? 0) + 1
      }
    }

    return {
      id: enrollment.id,
      enrolledAt: enrollment.enrolledAt.toISOString(),
      isActive: enrollment.isActive,
      currentStep: enrollment.currentStep,
      autoStopOnReply: enrollment.autoStopOnReply,
      campaign: {
        id: campaign?.id ?? null,
        name: campaign?.name ?? 'Unnamed Campaign',
        steps: stepsWithDates.map(({ step, scheduledAt }) => ({
          id: step.id,
          order: step.order,
          actionType: step.actionType as string,
          delayAmount: step.delayAmount as number,
          delayUnit: step.delayUnit as string,
          scheduledAt: scheduledAt.toISOString(),
          isCompleted: (step.order as number) < enrollment.currentStep,
        })),
      },
      stats,
    }
  })

  return NextResponse.json({ data })
}
