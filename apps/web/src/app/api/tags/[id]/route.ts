import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { Tag } from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

const UpdateTagSchema = z.object({
  name: z.string().min(1).max(64).trim().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

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

  // If renaming, check duplicate within the same category.
  if (parsed.data.name && parsed.data.name !== tag.name) {
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
  return NextResponse.json({ data: tag })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const tag = await Tag.findByPk(id)
  if (!tag) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await tag.destroy()
  return NextResponse.json({ success: true })
}
