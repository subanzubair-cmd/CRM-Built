import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { CampaignEnrollment } from '@crm/database'

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

  // Composite-unique upsert on (campaignId, propertyId).
  const [enrollment, created] = await CampaignEnrollment.findOrCreate({
    where: { campaignId, propertyId: parsed.data.propertyId },
    defaults: {
      campaignId,
      propertyId: parsed.data.propertyId,
      currentStep: 0,
      isActive: true,
    },
  })
  if (!created) {
    await enrollment.update({
      isActive: true,
      currentStep: 0,
      completedAt: null,
      pausedAt: null,
    })
  }

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

  await CampaignEnrollment.update(
    { isActive: false },
    { where: { campaignId, propertyId: parsed.data.propertyId } },
  )

  return new NextResponse(null, { status: 204 })
}
