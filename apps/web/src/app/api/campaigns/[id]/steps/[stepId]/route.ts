import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

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

  const step = await prisma.campaignStep.updateMany({
    where: { id: stepId, campaignId },
    data: parsed.data,
  })

  if (step.count === 0) {
    return NextResponse.json({ error: 'Step not found' }, { status: 404 })
  }

  const updated = await prisma.campaignStep.findUnique({ where: { id: stepId } })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId, stepId } = await params

  const deleted = await prisma.campaignStep.deleteMany({
    where: { id: stepId, campaignId },
  })

  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Step not found' }, { status: 404 })
  }

  // Re-order remaining steps
  const remaining = await prisma.campaignStep.findMany({
    where: { campaignId },
    orderBy: { order: 'asc' },
    select: { id: true },
  })

  await Promise.all(
    remaining.map((s, idx) =>
      prisma.campaignStep.update({ where: { id: s.id }, data: { order: idx + 1 } })
    )
  )

  return new NextResponse(null, { status: 204 })
}
