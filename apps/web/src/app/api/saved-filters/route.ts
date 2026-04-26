import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { SavedFilter } from '@crm/database'
import { z } from 'zod'

const CreateSchema = z.object({
  name: z.string().min(1).max(64),
  pipeline: z.string().min(1),
  filters: z.record(z.string()),
})

// GET /api/saved-filters?pipeline=dts
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const { searchParams } = new URL(req.url)
  const pipeline = searchParams.get('pipeline')
  if (!pipeline) return NextResponse.json({ error: 'pipeline param required' }, { status: 422 })

  const filters = await SavedFilter.findAll({
    where: { userId, pipeline },
    order: [['createdAt', 'ASC']],
    raw: true,
  })

  return NextResponse.json({ data: filters })
}

// POST /api/saved-filters
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { name, pipeline, filters } = parsed.data

  // Composite-unique upsert on (userId, name, pipeline)
  const [saved, created] = await SavedFilter.findOrCreate({
    where: { userId, name, pipeline },
    defaults: { userId, name, pipeline, filters },
  })
  if (!created) {
    await saved.update({ filters })
  }

  return NextResponse.json({ success: true, data: saved }, { status: 201 })
}
