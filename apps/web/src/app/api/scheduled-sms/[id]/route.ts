import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { CampaignEnrollment } from '@crm/database'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { action } = body

  const enrollment = await CampaignEnrollment.findByPk(id)
  if (!enrollment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'cancel') {
    await enrollment.update({ isActive: false, completedAt: new Date() })
    return NextResponse.json({ data: enrollment })
  }

  if (action === 'pause') {
    await enrollment.update({ isActive: false, pausedAt: new Date() })
    return NextResponse.json({ data: enrollment })
  }

  if (action === 'resume') {
    await enrollment.update({ isActive: true, pausedAt: null })
    return NextResponse.json({ data: enrollment })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
