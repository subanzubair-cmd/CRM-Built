import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { PipelineStageConfig } from '@crm/database'
import { z } from 'zod'

/**
 * POST /api/pipeline-stages/reorder
 *   Bulk-reorder stages within a pipeline.
 *   Accepts { pipeline, stageIds: string[] } where stageIds is the
 *   desired order from top to bottom.
 */

const ReorderSchema = z.object({
  pipeline: z.string().min(1),
  stageIds: z.array(z.string()).min(1),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const body = await req.json()
  const parsed = ReorderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { pipeline, stageIds } = parsed.data

  // Verify all IDs belong to the specified pipeline
  const stages = await PipelineStageConfig.findAll({
    where: { pipeline },
    order: [['sortOrder', 'ASC']],
  })

  const stageMap = new Map(stages.map((s) => [s.id, s]))

  for (const id of stageIds) {
    if (!stageMap.has(id)) {
      return NextResponse.json(
        { error: `Stage ${id} does not belong to pipeline "${pipeline}".` },
        { status: 400 },
      )
    }
  }

  // Apply new order
  for (let i = 0; i < stageIds.length; i++) {
    const stage = stageMap.get(stageIds[i])!
    if (stage.sortOrder !== i) {
      await stage.update({ sortOrder: i })
    }
  }

  // Fetch and return updated order
  const updated = await PipelineStageConfig.findAll({
    where: { pipeline },
    order: [['sortOrder', 'ASC']],
    raw: true,
  })

  return NextResponse.json({ data: updated })
}
