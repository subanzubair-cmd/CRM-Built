import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const VALID_ENTITY_TYPES = ['leads', 'buyers', 'vendors', 'dispo', 'inventory']

type Params = { params: Promise<{ entityType: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityType } = await params
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
  }

  const config = await prisma.customFormConfig.findUnique({
    where: { entityType },
  })

  return NextResponse.json({ data: config ?? { entityType, sections: [] } })
}

const UpdateSchema = z.object({
  sections: z.array(z.object({
    title: z.string().min(1),
    order: z.number().int().min(0),
    fields: z.array(z.object({
      label: z.string().min(1),
      fieldType: z.enum(['text', 'number', 'date', 'select', 'checkbox', 'textarea']),
      required: z.boolean().default(false),
      options: z.array(z.string()).optional(),
    })),
  })),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityType } = await params
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const config = await prisma.customFormConfig.upsert({
    where: { entityType },
    create: { entityType, sections: JSON.parse(JSON.stringify(parsed.data.sections)) },
    update: { sections: JSON.parse(JSON.stringify(parsed.data.sections)) },
  })

  return NextResponse.json({ success: true, data: config })
}
