import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const GoalSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  type: z.enum(['REVENUE', 'MARKETING_SPEND', 'NET_INCOME']),
  target: z.number().min(0),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const year = req.nextUrl.searchParams.get('year')
    ? parseInt(req.nextUrl.searchParams.get('year')!)
    : new Date().getFullYear()

  const goals = await (prisma as any).financialGoal.findMany({
    where: { userId, year },
    orderBy: { type: 'asc' },
  })

  return NextResponse.json({ goals })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const body = await req.json()
  const parsed = GoalSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { year, type, target } = parsed.data

  const goal = await (prisma as any).financialGoal.upsert({
    where: { userId_year_type: { userId, year, type } },
    update: { target },
    create: { userId, year, type, target },
  })

  return NextResponse.json({ goal }, { status: 201 })
}
