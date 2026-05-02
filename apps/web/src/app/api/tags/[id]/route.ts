import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { Tag, sequelize } from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

const UpdateTagSchema = z.object({
  name: z.string().min(1).max(64).trim().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

/** Map a Tag category to the Property.leadType value used to scope the update. */
function leadTypeForCategory(category: string): string | null {
  if (category === 'dts') return 'DIRECT_TO_SELLER'
  if (category === 'dta') return 'DIRECT_TO_AGENT'
  return null
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateTagSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const tag = await Tag.findByPk(id)
  if (!tag) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const oldName = tag.name

  // If renaming, check duplicate within the same category.
  if (parsed.data.name && parsed.data.name !== oldName) {
    const duplicate = await Tag.findOne({
      where: { name: parsed.data.name, category: tag.category },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: `Tag "${parsed.data.name}" already exists in ${tag.category} category` },
        { status: 409 },
      )
    }
  }

  await tag.update(parsed.data)

  // Propagate rename to every Property that carries the old tag name.
  if (parsed.data.name && parsed.data.name !== oldName) {
    const newName = parsed.data.name
    const leadType = leadTypeForCategory(tag.category)
    if (leadType) {
      await sequelize.query(
        `UPDATE "Property" SET tags = array_replace(tags, :oldName, :newName) WHERE :oldName = ANY(tags) AND "leadType" = :leadType`,
        { replacements: { oldName, newName, leadType } },
      )
    } else {
      await sequelize.query(
        `UPDATE "Property" SET tags = array_replace(tags, :oldName, :newName) WHERE :oldName = ANY(tags)`,
        { replacements: { oldName, newName } },
      )
    }
  }

  return NextResponse.json({ data: tag })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const tag = await Tag.findByPk(id)
  if (!tag) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const tagName = tag.name
  const category = tag.category

  await tag.destroy()

  // Cascade: remove the tag name from every Property that carries it.
  // DTS/DTA are scoped by leadType; buyer/vendor tags apply across all rows.
  const leadType = leadTypeForCategory(category)
  if (leadType) {
    await sequelize.query(
      `UPDATE "Property" SET tags = array_remove(tags, :tagName) WHERE :tagName = ANY(tags) AND "leadType" = :leadType`,
      { replacements: { tagName, leadType } },
    )
  } else {
    await sequelize.query(
      `UPDATE "Property" SET tags = array_remove(tags, :tagName) WHERE :tagName = ANY(tags)`,
      { replacements: { tagName } },
    )
  }

  return NextResponse.json({ success: true })
}
