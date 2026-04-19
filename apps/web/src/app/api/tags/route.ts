import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth-utils'

const CreateTagSchema = z.object({
  name: z.string().min(1).max(64).trim(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
  category: z.enum(['lead', 'buyer', 'task']).default('lead'),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')

  const where = category ? { category } : {}
  const tags = await prisma.tag.findMany({
    where,
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ data: tags })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const body = await req.json()
  const parsed = CreateTagSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  // Check for duplicate
  const existing = await prisma.tag.findUnique({
    where: { name_category: { name: parsed.data.name, category: parsed.data.category } },
  })
  if (existing) {
    return NextResponse.json(
      { error: `Tag "${parsed.data.name}" already exists in ${parsed.data.category} category` },
      { status: 409 },
    )
  }

  const tag = await prisma.tag.create({ data: parsed.data })
  return NextResponse.json({ data: tag }, { status: 201 })
}
