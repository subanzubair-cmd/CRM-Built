import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Property, ActivityLog, StageHistory, sequelize } from '@crm/database'
import { z } from 'zod'
import { runBuyerMatching } from '@/lib/buyer-matching'
import { enqueueAutomation } from '@/lib/queue'
import { requirePermission } from '@/lib/auth-utils'

const VALID_TRANSITIONS: Record<string, string[]> = {
  LEAD:            ['UNDER_CONTRACT', 'DEAD'],
  UNDER_CONTRACT:  ['IN_TM', 'DEAD'],
  IN_TM:           ['IN_INVENTORY', 'IN_DISPO', 'SOLD', 'RENTAL', 'DEAD'],
  IN_INVENTORY:    ['IN_DISPO', 'SOLD', 'RENTAL', 'DEAD'],
  IN_DISPO:        ['SOLD', 'IN_INVENTORY', 'DEAD'],
}

const DUAL_PIPELINE_EXITS = [
  'WHOLESALE_ASSIGNMENT',
  'WHOLESALE_DOUBLE_CLOSE',
  'INSTALLMENT',
  'SELLER_FINANCE',
]

const PromoteSchema = z.object({
  toStatus: z.enum(['UNDER_CONTRACT', 'IN_TM', 'IN_INVENTORY', 'IN_DISPO', 'SOLD', 'RENTAL', 'DEAD']),
  contractDate: z.string().datetime().optional(),
  soldAt: z.string().datetime().optional(),
  exitStrategy: z.string().optional(),
  reason: z.string().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny
  const sessionUser = (session as any)?.user ?? {}
  const userId = sessionUser.id as string
  const userName = (sessionUser.name ?? 'Unknown') as string

  const { id } = await params
  const body = await req.json()
  const parsed = PromoteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const existing = await Property.findByPk(id, {
    attributes: ['propertyStatus', 'tmStage'],
    raw: true,
  }) as any
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { toStatus, contractDate, soldAt, exitStrategy, reason } = parsed.data

  if (existing.propertyStatus === toStatus) {
    const current = await Property.findByPk(id)
    return NextResponse.json({ success: true, data: current?.get({ plain: true }), idempotent: true }, { status: 200 })
  }

  const validNext = VALID_TRANSITIONS[existing.propertyStatus] ?? []
  if (!validNext.includes(toStatus)) {
    return NextResponse.json({
      error: `Cannot transition from ${existing.propertyStatus} to ${toStatus}`,
    }, { status: 422 })
  }

  const isDualPipeline =
    toStatus === 'IN_TM' &&
    exitStrategy != null &&
    DUAL_PIPELINE_EXITS.includes(exitStrategy)

  const stageDefaults: Record<string, Record<string, unknown>> = {
    IN_TM:        { tmStage: 'NEW_CONTRACT', ...(isDualPipeline && { inDispo: true }) },
    IN_INVENTORY: { inventoryStage: 'NEW_INVENTORY', inDispo: false },
    IN_DISPO:     { inDispo: true },
    SOLD:         { soldAt: soldAt ? new Date(soldAt) : new Date(), inDispo: false, tmStage: null, inventoryStage: null, activeLeadStage: null },
    RENTAL:       { inDispo: false, tmStage: null, inventoryStage: null, activeLeadStage: null },
    DEAD:         { leadStatus: 'DEAD', deadAt: new Date(), tmStage: null, inventoryStage: null, inDispo: false, activeLeadStage: null },
  }

  const pipelineLabel = toStatus === 'IN_TM' ? 'tm'
    : toStatus === 'IN_INVENTORY' ? 'inventory'
    : toStatus === 'IN_DISPO' ? 'dispo'
    : toStatus === 'RENTAL' ? 'rental'
    : toStatus === 'SOLD' ? 'sold'
    : toStatus === 'DEAD' ? 'dead'
    : 'leads'

  const result = await sequelize.transaction(async (tx) => {
    const [updateCount] = await Property.update(
      {
        propertyStatus: toStatus,
        ...(contractDate && {
          contractDate: /^\d{4}-\d{2}-\d{2}$/.test(contractDate)
            ? new Date(contractDate + 'T12:00:00')
            : new Date(contractDate),
        }),
        ...(exitStrategy && { exitStrategy }),
        ...(stageDefaults[toStatus] ?? {}),
      } as any,
      {
        where: { id, propertyStatus: existing.propertyStatus },
        transaction: tx,
      },
    )

    if (updateCount === 0) {
      return { raced: true as const }
    }

    const property = await Property.findByPk(id, { transaction: tx })

    await ActivityLog.create({
      propertyId: id,
      userId,
      action: 'PIPELINE_CHANGE',
      detail: {
        description: `Promoted to ${toStatus}${reason ? `: ${reason}` : ''}`,
        from: existing.propertyStatus,
        to: toStatus,
      },
    } as any, { transaction: tx })

    await StageHistory.create({
      propertyId: id,
      pipeline: pipelineLabel,
      fromStage: existing.propertyStatus,
      toStage: toStatus,
      changedById: userId,
      changedByName: userName,
      reason,
    } as any, { transaction: tx })

    return { raced: false as const, property: property?.get({ plain: true }) }
  })

  if (result.raced) {
    const current = await Property.findByPk(id)
    return NextResponse.json({ success: true, data: current?.get({ plain: true }), idempotent: true }, { status: 200 })
  }

  if (toStatus === 'IN_DISPO' || isDualPipeline) {
    runBuyerMatching(id).catch((err) =>
      console.error('[promote] buyer matching failed:', err),
    )
  }

  enqueueAutomation({
    trigger: 'STAGE_CHANGE',
    propertyId: id,
    meta: { from: existing.propertyStatus, to: toStatus },
  })

  return NextResponse.json({ success: true, data: result.property }, { status: 200 })
}
