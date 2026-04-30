import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { SavedFilterFolder } from '@crm/database'
import { z } from 'zod'

/**
 * Manage Filter folders for the per-user filter sidebar in Buyers /
 * Vendors / Leads. Folders are scoped per-user + per-pipeline, so
 * users don't accidentally share folder organisation across
 * teammates. Filter sharing happens at the SavedFilter level via
 * SavedFilterShare.
 */

const CreateSchema = z.object({
  name: z.string().min(1).max(64).trim(),
  pipeline: z.string().min(1),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const pipeline = req.nextUrl.searchParams.get('pipeline')
  if (!pipeline) return NextResponse.json({ error: 'pipeline param required' }, { status: 422 })

  const folders = await SavedFilterFolder.findAll({
    where: { userId, pipeline } as any,
    order: [['name', 'ASC']],
    raw: true,
  })
  return NextResponse.json({ data: folders })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const parsed = CreateSchema.safeParse(await req.json())
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  // The (userId, name, pipeline) composite-unique constraint guards
  // against duplicate folder names per user — surface that as a
  // 409 instead of a generic 500.
  const existing = await SavedFilterFolder.findOne({
    where: { userId, name: parsed.data.name, pipeline: parsed.data.pipeline } as any,
  })
  if (existing) {
    return NextResponse.json(
      { error: `Folder "${parsed.data.name}" already exists in this pipeline.` },
      { status: 409 },
    )
  }

  const folder = await SavedFilterFolder.create({
    userId,
    name: parsed.data.name,
    pipeline: parsed.data.pipeline,
  } as any)
  return NextResponse.json({ success: true, data: folder }, { status: 201 })
}
