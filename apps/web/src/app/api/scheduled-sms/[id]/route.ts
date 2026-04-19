import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { action } = body

  if (action === 'cancel') {
    const updated = await prisma.campaignEnrollment.update({
      where: { id },
      data: { isActive: false, completedAt: new Date() },
    })
    return NextResponse.json({ data: updated })
  }

  if (action === 'pause') {
    const updated = await prisma.campaignEnrollment.update({
      where: { id },
      data: { isActive: false, pausedAt: new Date() },
    })
    return NextResponse.json({ data: updated })
  }

  if (action === 'resume') {
    const updated = await prisma.campaignEnrollment.update({
      where: { id },
      data: { isActive: true, pausedAt: null },
    })
    return NextResponse.json({ data: updated })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
