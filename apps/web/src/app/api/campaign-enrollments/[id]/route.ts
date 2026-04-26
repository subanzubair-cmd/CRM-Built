import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { CampaignEnrollment } from '@crm/database'
import { z } from 'zod'

const PatchSchema = z.object({
  action: z.enum(['pause', 'resume', 'cancel']),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { action } = parsed.data

  const data =
    action === 'pause'
      ? { pausedAt: new Date(), isActive: false }
      : action === 'resume'
        ? { pausedAt: null, isActive: true }
        : { isActive: false, completedAt: new Date() } // cancel

  const enrollment = await CampaignEnrollment.findByPk(id)
  if (!enrollment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await enrollment.update(data)
  return NextResponse.json({ enrollment })
}
