import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const CreateStepSchema = z.object({
  channel: z.enum(['SMS', 'CALL', 'RVM', 'EMAIL', 'NOTE', 'SYSTEM']),
  subject: z.string().optional(),
  body: z.string().min(1),
  delayDays: z.number().int().min(0).default(0),
  delayHours: z.number().int().min(0).default(0),
})

const DeleteStepSchema = z.object({
  stepId: z.string().min(1),
})

const ReorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const body = await req.json()
  const parsed = CreateStepSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const lastStep = await prisma.campaignStep.findFirst({
    where: { campaignId },
    orderBy: { order: 'desc' },
    select: { order: true },
  })
  const order = (lastStep?.order ?? 0) + 1

  const step = await prisma.campaignStep.create({
    data: { campaignId, order, ...parsed.data },
  })

  return NextResponse.json(step, { status: 201 })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const body = await req.json()
  const parsed = ReorderSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  await Promise.all(
    parsed.data.orderedIds.map((id, idx) =>
      prisma.campaignStep.updateMany({
        where: { id, campaignId },
        data: { order: idx + 1 },
      })
    )
  )

  const steps = await prisma.campaignStep.findMany({
    where: { campaignId },
    orderBy: { order: 'asc' },
  })

  return NextResponse.json(steps)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const body = await req.json()
  const parsed = DeleteStepSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  await prisma.campaignStep.deleteMany({
    where: { id: parsed.data.stepId, campaignId },
  })

  return new NextResponse(null, { status: 204 })
}
