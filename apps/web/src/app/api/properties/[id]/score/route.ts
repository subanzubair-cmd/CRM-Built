import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { scoreHotLead } from '@/lib/hot-lead'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const score = await scoreHotLead(id)
    const isHot = score >= 60

    await prisma.property.update({
      where: { id },
      data: { isHot },
    })

    return NextResponse.json({ score, isHot })
  } catch (err) {
    console.error('[score] error:', err)
    return NextResponse.json({ error: 'AI scoring failed' }, { status: 500 })
  }
}
