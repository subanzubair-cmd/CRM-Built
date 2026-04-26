import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { CampaignStep } from '@crm/database'

const UpdateStepSchema = z.object({
  channel: z.enum(['SMS', 'CALL', 'RVM', 'EMAIL', 'NOTE', 'SYSTEM']).optional(),
  subject: z.string().nullable().optional(),
  body: z.string().min(1).optional(),
  delayDays: z.number().int().min(0).optional(),
  delayHours: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId, stepId } = await params
  const body = await req.json()
  const parsed = UpdateStepSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const [count] = await CampaignStep.update(parsed.data, {
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
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId, stepId } = await params

  const deletedCount = await CampaignStep.destroy({
    where: { id: stepId, campaignId },
  })

  if (deletedCount === 0) {
    return NextResponse.json({ error: 'Step not found' }, { status: 404 })
  }

  // Re-order remaining steps
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
