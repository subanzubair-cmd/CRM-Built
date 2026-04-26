import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { EsignTemplate, EsignDocument, literal } from '@crm/database'

const CreateTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['active', 'archived']).default('active'),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Replace Prisma's `_count: { select: { documents: true } }` with a
  // correlated subquery so we don't pull every document row.
  const templates = await EsignTemplate.findAll({
    order: [['createdAt', 'DESC']],
    attributes: {
      include: [
        [
          literal(
            `(SELECT COUNT(*)::int FROM "EsignDocument" ed WHERE ed."templateId" = "EsignTemplate"."id")`,
          ),
          'documentCount',
        ],
      ],
    },
  })

  // Re-shape into the legacy `_count: { documents: n }` envelope the
  // frontend expects.
  const shaped = templates.map((t) => {
    const json = t.toJSON() as any
    return {
      ...json,
      _count: { documents: Number(json.documentCount ?? 0) },
    }
  })

  return NextResponse.json(shaped)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateTemplateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const template = await EsignTemplate.create(parsed.data)
  return NextResponse.json(template, { status: 201 })
}
