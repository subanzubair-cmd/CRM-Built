import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { Tag, sequelize } from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

const MergeTagSchema = z.object({
  targetTagId: z.string().min(1),
})

/** Map a Tag category to the Property.leadType value used to scope the update. */
function leadTypeForCategory(category: string): string | null {
  if (category === 'dts') return 'DIRECT_TO_SELLER'
  if (category === 'dta') return 'DIRECT_TO_AGENT'
  return null
}

/**
 * POST /api/tags/:id/merge
 * Body: { targetTagId: string }
 *
 * Merges the source tag (id) into the target tag (targetTagId):
 *  1. Replaces every occurrence of the source tag name in Property.tags with the target tag name.
 *  2. Deletes the source Tag record from the catalog.
 *
 * Both tags must belong to the same category.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id: sourceId } = await params
  const body = await req.json()
  const parsed = MergeTagSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { targetTagId } = parsed.data

  if (sourceId === targetTagId) {
    return NextResponse.json({ error: 'Source and target tags must be different' }, { status: 400 })
  }

  const [sourceTag, targetTag] = await Promise.all([
    Tag.findByPk(sourceId),
    Tag.findByPk(targetTagId),
  ])

  if (!sourceTag) return NextResponse.json({ error: 'Source tag not found' }, { status: 404 })
  if (!targetTag) return NextResponse.json({ error: 'Target tag not found' }, { status: 404 })

  if (sourceTag.category !== targetTag.category) {
    return NextResponse.json(
      { error: 'Tags must belong to the same category to be merged' },
      { status: 400 },
    )
  }

  const sourceName = sourceTag.name
  const targetName = targetTag.name
  const category = sourceTag.category

  // Replace all Property.tags entries that reference the source name with the target name.
  const leadType = leadTypeForCategory(category)
  if (leadType) {
    await sequelize.query(
      `UPDATE "Property" SET tags = array_replace(tags, :sourceName, :targetName) WHERE :sourceName = ANY(tags) AND "leadType" = :leadType`,
      { replacements: { sourceName, targetName, leadType } },
    )
  } else {
    await sequelize.query(
      `UPDATE "Property" SET tags = array_replace(tags, :sourceName, :targetName) WHERE :sourceName = ANY(tags)`,
      { replacements: { sourceName, targetName } },
    )
  }

  // Delete the source tag record from the catalog.
  await sourceTag.destroy()

  return NextResponse.json({ ok: true })
}
