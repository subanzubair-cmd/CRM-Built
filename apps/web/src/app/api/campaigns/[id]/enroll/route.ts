import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const EnrollSchema = z.object({ propertyId: z.string().min(1) })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const body = await req.json()
  const parsed = EnrollSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const enrollment = await prisma.campaignEnrollment.upsert({
    where: { campaignId_propertyId: { campaignId, propertyId: parsed.data.propertyId } },
    create: { campaignId, propertyId: parsed.data.propertyId, currentStep: 0, isActive: true },
    update: { isActive: true, currentStep: 0, completedAt: null, pausedAt: null },
  })

  return NextResponse.json(enrollment, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const body = await req.json()
  const parsed = EnrollSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  await prisma.campaignEnrollment.updateMany({
    where: { campaignId, propertyId: parsed.data.propertyId },
    data: { isActive: false },
  })

  return new NextResponse(null, { status: 204 })
}
