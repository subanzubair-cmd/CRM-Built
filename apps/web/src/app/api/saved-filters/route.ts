import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { SavedFilter, SavedFilterShare, Op, literal } from '@crm/database'
import { z } from 'zod'

/**
 * Buyer / lead saved filters. Extended in Phase B to carry an
 * optional `folderId`, a `description`, and a `shared` flag. The
 * GET response now includes filters that have been *shared* with
 * the current user (level VIEW or EDIT) in addition to filters they
 * own outright.
 */
const CreateSchema = z.object({
  name: z.string().min(1).max(64),
  pipeline: z.string().min(1),
  filters: z.record(z.unknown()),
  folderId: z.string().nullable().optional(),
  description: z.string().max(280).optional(),
  isDefault: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const { searchParams } = new URL(req.url)
  const pipeline = searchParams.get('pipeline')
  if (!pipeline) return NextResponse.json({ error: 'pipeline param required' }, { status: 422 })

  // Owner OR explicitly-shared (level != NONE) — sharing rows are
  // resolved by a literal subquery so we don't have to JOIN.
  const filters = await SavedFilter.findAll({
    where: {
      pipeline,
      [Op.or]: [
        { userId },
        {
          id: {
            [Op.in]: literal(
              `(SELECT "savedFilterId" FROM "SavedFilterShare" WHERE "userId" = '${userId.replace(/'/g, "''")}' AND "level" <> 'NONE')`,
            ),
          },
        },
      ],
    } as any,
    order: [['createdAt', 'ASC']],
    raw: true,
  })

  return NextResponse.json({ data: filters })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { name, pipeline, filters, folderId, description, isDefault } = parsed.data

  const [saved, created] = await SavedFilter.findOrCreate({
    where: { userId, name, pipeline },
    defaults: {
      userId,
      name,
      pipeline,
      filters,
      folderId: folderId ?? null,
      description: description ?? null,
      isDefault: isDefault ?? false,
    } as any,
  })
  if (!created) {
    await saved.update({
      filters,
      folderId: folderId ?? saved.get('folderId'),
      description: description ?? saved.get('description'),
      isDefault: isDefault ?? saved.get('isDefault'),
    } as any)
  }

  return NextResponse.json({ success: true, data: saved }, { status: 201 })
}
