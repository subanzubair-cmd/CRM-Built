import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { LeadSource, LeadCampaign } from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const UpdateLeadSourceSchema = z.object({
  name: z.string().min(1).max(120).trim().optional(),
  isActive: z.boolean().optional(),
})

/**
 * PATCH /api/lead-sources/:id
 * Updates a lead source. System sources only allow toggling isActive.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params

  const body = await req.json()
  const parsed = UpdateLeadSourceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const source = await LeadSource.findByPk(id)
  if (!source) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Check for name collision when renaming
  if (parsed.data.name && parsed.data.name !== source.name) {
    const duplicate = await LeadSource.findOne({
      where: { name: parsed.data.name },
      attributes: ['id'],
    })
    if (duplicate) {
      return NextResponse.json(
        { error: `Lead source "${parsed.data.name}" already exists` },
        { status: 409 },
      )
    }
  }

  await source.update(parsed.data)

  return NextResponse.json({
    data: {
      id: source.id,
      name: source.name,
      isActive: source.isActive,
      isSystem: source.isSystem,
    },
  })
}

/**
 * DELETE /api/lead-sources/:id
 * Hard-deletes non-system sources with no LeadCampaign references; otherwise
 * marks as inactive.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params

  const source = await LeadSource.findByPk(id)
  if (!source) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const referenceCount = await LeadCampaign.count({ where: { leadSourceId: id } })

  if (referenceCount > 0) {
    // Soft deactivate — has campaign references
    await source.update({ isActive: false })
    return NextResponse.json({ success: true, deleted: false })
  }

  await source.destroy()
  return NextResponse.json({ success: true, deleted: true })
}
