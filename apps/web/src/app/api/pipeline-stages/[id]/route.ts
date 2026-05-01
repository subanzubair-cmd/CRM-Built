import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { PipelineStageConfig } from '@crm/database'
import { z } from 'zod'

/**
 * PATCH /api/pipeline-stages/[id]
 *   Update a stage's label, color, or active flag.
 *
 * DELETE /api/pipeline-stages/[id]
 *   Delete a stage. System stages cannot be deleted.
 */

const UpdateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  color: z.string().max(20).nullable().optional(),
  isActive: z.boolean().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const stage = await PipelineStageConfig.findByPk(id)
  if (!stage) {
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
  }

  const patch: Record<string, unknown> = {}
  if (parsed.data.label !== undefined) patch.label = parsed.data.label
  if (parsed.data.color !== undefined) patch.color = parsed.data.color
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive

  if (Object.keys(patch).length > 0) {
    await stage.update(patch as any)
  }

  return NextResponse.json({ data: stage.get({ plain: true }) })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params

  const stage = await PipelineStageConfig.findByPk(id)
  if (!stage) {
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
  }

  if (stage.isSystem) {
    return NextResponse.json(
      {
        error:
          'This is a system stage and cannot be deleted. It has backend actions wired to it (e.g. routing rules, modal triggers).',
      },
      { status: 403 },
    )
  }

  const pipeline = stage.pipeline

  await stage.destroy()

  // Recompute sort orders for remaining stages in this pipeline
  const remaining = await PipelineStageConfig.findAll({
    where: { pipeline },
    order: [['sortOrder', 'ASC']],
  })
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].sortOrder !== i) {
      await remaining[i].update({ sortOrder: i })
    }
  }

  return NextResponse.json({ success: true })
}
