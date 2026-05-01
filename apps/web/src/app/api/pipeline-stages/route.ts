import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { PipelineStageConfig } from '@crm/database'
import { z } from 'zod'

/**
 * GET /api/pipeline-stages?pipeline=dts_leads
 *   Returns all stages for the given pipeline, ordered by sortOrder.
 *   If no pipeline query param is given, returns ALL stages grouped
 *   by pipeline.
 *
 * POST /api/pipeline-stages
 *   Adds a new custom stage to a pipeline. Requires settings.manage.
 */

const VALID_PIPELINES = ['dts_leads', 'dta_leads', 'tm', 'inventory', 'dispo'] as const

const CreateSchema = z.object({
  pipeline: z.enum(VALID_PIPELINES),
  stageCode: z
    .string()
    .min(1)
    .max(100)
    .transform((v) => v.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')),
  label: z.string().min(1).max(100),
  color: z.string().max(20).nullable().optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pipeline = req.nextUrl.searchParams.get('pipeline')

  const where: Record<string, unknown> = {}
  if (pipeline) where.pipeline = pipeline

  const stages = await PipelineStageConfig.findAll({
    where,
    order: [
      ['pipeline', 'ASC'],
      ['sortOrder', 'ASC'],
    ],
    raw: true,
  })

  return NextResponse.json({ data: stages })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors
    const first = Object.values(fields).flat()[0]
    return NextResponse.json(
      { error: first ?? 'Invalid stage data' },
      { status: 422 },
    )
  }

  const { pipeline, stageCode, label, color } = parsed.data

  try {
    // Check for duplicate stageCode in the pipeline
    const existing = await PipelineStageConfig.findOne({
      where: { pipeline, stageCode },
    })
    if (existing) {
      return NextResponse.json(
        { error: `Stage "${stageCode}" already exists in this pipeline.` },
        { status: 409 },
      )
    }

    // Determine the next sortOrder
    const maxOrder = (await PipelineStageConfig.max('sortOrder', {
      where: { pipeline },
    })) as number | null

    const stage = await PipelineStageConfig.create({
      pipeline,
      stageCode,
      label,
      color: color ?? null,
      sortOrder: (maxOrder ?? -1) + 1,
      isSystem: false,
      isActive: true,
    })

    return NextResponse.json({ data: stage.get({ plain: true }) }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/pipeline-stages]', err)
    const message = err instanceof Error ? err.message : 'Database error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
