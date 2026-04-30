import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { SavedFilterFolder, SavedFilter } from '@crm/database'
import { z } from 'zod'

const PatchSchema = z.object({
  name: z.string().min(1).max(64).trim().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params
  const parsed = PatchSchema.safeParse(await req.json())
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const folder = await SavedFilterFolder.findByPk(id)
  if (!folder || folder.get('userId') !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await folder.update(parsed.data as any)
  return NextResponse.json({ success: true, data: folder })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params
  const folder = await SavedFilterFolder.findByPk(id)
  if (!folder || folder.get('userId') !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Detach contained filters first (set folderId NULL) instead of
  // cascading, so deleting a folder doesn't lose the user's saved
  // filter work — they re-appear under "Individual Filters."
  await SavedFilter.update(
    { folderId: null } as any,
    { where: { folderId: id } } as any,
  )
  await folder.destroy()
  return new NextResponse(null, { status: 204 })
}
