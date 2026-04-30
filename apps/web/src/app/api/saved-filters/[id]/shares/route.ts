import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { SavedFilter, SavedFilterShare } from '@crm/database'
import { z } from 'zod'

/**
 * Per-filter sharing matrix. The owner can hit GET to see which
 * teammates have access at which level, and POST to set / change /
 * revoke a single user's share level. The shared/owner mirror flag
 * on `SavedFilter.shared` is recomputed after each write so the
 * Manage Filters list can show the badge without a JOIN.
 */

type Params = { params: Promise<{ id: string }> }

const PostSchema = z.object({
  userId: z.string().min(1),
  level: z.enum(['NONE', 'VIEW', 'EDIT']),
})

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params
  const filter = await SavedFilter.findByPk(id)
  if (!filter || filter.get('userId') !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const shares = await SavedFilterShare.findAll({
    where: { savedFilterId: id } as any,
    raw: true,
  })
  return NextResponse.json({ data: shares })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params
  const filter = await SavedFilter.findByPk(id)
  if (!filter || filter.get('userId') !== ownerId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const parsed = PostSchema.safeParse(await req.json())
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  const { userId, level } = parsed.data

  // Composite-unique upsert on (savedFilterId, userId).
  const [share, created] = await SavedFilterShare.findOrCreate({
    where: { savedFilterId: id, userId } as any,
    defaults: {
      savedFilterId: id,
      userId,
      level,
      grantedById: ownerId,
    } as any,
  })
  if (!created) {
    await share.update({ level, grantedById: ownerId } as any)
  }

  // Mirror onto SavedFilter.shared so the list view doesn't need a
  // JOIN to render the "Shared" badge.
  const anyActive = await SavedFilterShare.count({
    where: { savedFilterId: id } as any,
    // count NONE-level rows too — we want shared=false only when
    // there are zero rows or every row is NONE.
  })
  const nonNone = await SavedFilterShare.count({
    where: { savedFilterId: id, level: ['VIEW', 'EDIT'] as any } as any,
  })
  await filter.update({ shared: nonNone > 0 } as any)
  void anyActive

  return NextResponse.json({ success: true, data: share }, { status: created ? 201 : 200 })
}
