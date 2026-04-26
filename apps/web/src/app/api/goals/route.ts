import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { FinancialGoal } from '@crm/database'
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

  const goals = await FinancialGoal.findAll({
    where: { userId, year },
    order: [['type', 'ASC']],
    raw: true,
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

  // Composite-unique upsert on (userId, year, type) — replicates Prisma's
  // findUnique+update / create with the @@unique([userId, year, type]) key.
  const [goal, created] = await FinancialGoal.findOrCreate({
    where: { userId, year, type },
    defaults: { userId, year, type, target },
  })
  if (!created) {
    await goal.update({ target })
  }

  return NextResponse.json({ goal }, { status: 201 })
}
