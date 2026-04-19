import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const VALID_ENTITY_TYPES = ['leads', 'buyers', 'vendors']

const UpsertSchema = z.object({
  entityType: z.enum(['leads', 'buyers', 'vendors'] as const),
  fields: z.array(z.object({
    fieldName: z.string().min(1),
    label: z.string().min(1),
    visible: z.boolean().default(true),
    required: z.boolean().default(false),
  })),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const configs = await prisma.webFormConfig.findMany({
    orderBy: { entityType: 'asc' },
  })

  return NextResponse.json({ data: configs })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = UpsertSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { entityType, fields } = parsed.data

  // Generate embed code
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const embedCode = `<iframe src="${baseUrl}/forms/${entityType}" width="100%" height="600" frameborder="0" style="border: none;"></iframe>`

  const config = await prisma.webFormConfig.upsert({
    where: { entityType },
    create: { entityType, fields: JSON.parse(JSON.stringify(fields)), embedCode },
    update: { fields: JSON.parse(JSON.stringify(fields)), embedCode },
  })

  return NextResponse.json({ success: true, data: config })
}
