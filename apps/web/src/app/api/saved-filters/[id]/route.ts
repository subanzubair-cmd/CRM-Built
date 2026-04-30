import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { SavedFilter } from '@crm/database'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const PatchSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().max(280).nullable().optional(),
  folderId: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  filters: z.record(z.unknown()).optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params
  const filter = await SavedFilter.findOne({ where: { id, userId } as any })
  if (!filter) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = PatchSchema.safeParse(await req.json())
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  await filter.update(parsed.data as any)
  return NextResponse.json({ success: true, data: filter })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params

  const filter = await SavedFilter.findOne({ where: { id, userId } as any })
  if (!filter) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await filter.destroy()
  return new NextResponse(null, { status: 204 })
}
