import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { CustomFormConfig } from '@crm/database'
import { z } from 'zod'

const UpsertSchema = z.object({
  entityType: z.enum(['leads', 'buyers', 'vendors', 'dispo', 'inventory'] as const),
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

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const configs = await CustomFormConfig.findAll({
    order: [['entityType', 'ASC']],
    raw: true,
  })

  return NextResponse.json({ data: configs })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = UpsertSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { entityType, sections } = parsed.data
  const sectionsJson = JSON.parse(JSON.stringify(sections))

  // Composite-unique upsert on entityType (which is the unique column).
  const [config, created] = await CustomFormConfig.findOrCreate({
    where: { entityType },
    defaults: { entityType, sections: sectionsJson },
  })
  if (!created) {
    await config.update({ sections: sectionsJson })
  }

  return NextResponse.json({ success: true, data: config })
}
