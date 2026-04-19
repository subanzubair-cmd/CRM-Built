import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
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

  const source = await (prisma as any).leadSource.findUnique({ where: { id } })
  if (!source) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (source.isSystem && parsed.data.name && parsed.data.name !== source.name) {
    return NextResponse.json(
      { error: 'Cannot rename system lead sources' },
      { status: 400 },
    )
  }

  // Check for name collision when renaming
  if (parsed.data.name && parsed.data.name !== source.name) {
    const duplicate = await (prisma as any).leadSource.findUnique({
      where: { name: parsed.data.name },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: `Lead source "${parsed.data.name}" already exists` },
        { status: 409 },
      )
    }
  }

  const updated = await (prisma as any).leadSource.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true, isActive: true, isSystem: true },
  })

  return NextResponse.json({ data: updated })
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

  const source = await (prisma as any).leadSource.findUnique({
    where: { id },
    include: { _count: { select: { leadCampaigns: true } } },
  })
  if (!source) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const hasReferences = (source._count?.leadCampaigns ?? 0) > 0

  if (!source.isSystem && !hasReferences) {
    await (prisma as any).leadSource.delete({ where: { id } })
    return NextResponse.json({ success: true, deleted: true })
  }

  // Soft deactivate — system source or has references
  await (prisma as any).leadSource.update({
    where: { id },
    data: { isActive: false },
  })

  return NextResponse.json({ success: true, deleted: false })
}
