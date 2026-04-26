import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Automation, AutomationAction, sequelize } from '@crm/database'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

const AutomationActionSchema = z.object({
  order: z.number().int().min(0),
  actionType: z.enum([
    'SEND_SMS', 'SEND_EMAIL', 'SEND_RVM', 'ADD_TAG',
    'CHANGE_STAGE', 'ASSIGN_USER', 'CREATE_TASK', 'ENROLL_CAMPAIGN',
  ]),
  config: z.record(z.unknown()).default({}),
})

const UpdateAutomationSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().optional(),
  trigger: z.enum([
    'STAGE_CHANGE', 'LEAD_CREATED', 'TAG_ADDED',
    'NO_CONTACT_X_DAYS', 'OFFER_MADE', 'UNDER_CONTRACT', 'MANUAL',
  ]).optional(),
  conditions: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  actions: z.array(AutomationActionSchema).optional(),
})

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  const { id } = await params
  const automation = await Automation.findByPk(id, {
    include: [{ model: AutomationAction, as: 'actions', separate: true, order: [['order', 'ASC']] }],
  })
  if (!automation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(automation)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const automation = await Automation.findByPk(id)
  if (!automation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = UpdateAutomationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { actions, conditions, ...fields } = parsed.data

  await sequelize.transaction(async (t) => {
    if (actions !== undefined) {
      await AutomationAction.destroy({
        where: { automationId: id },
        transaction: t,
      })
    }

    await automation.update(
      { ...fields, ...(conditions !== undefined ? { conditions } : {}) },
      { transaction: t },
    )

    if (actions !== undefined && actions.length > 0) {
      await AutomationAction.bulkCreate(
        actions.map((a) => ({
          automationId: id,
          order: a.order,
          actionType: a.actionType,
          config: a.config,
        })),
        { transaction: t },
      )
    }
  })

  const fresh = await Automation.findByPk(id, {
    include: [{ model: AutomationAction, as: 'actions', separate: true, order: [['order', 'ASC']] }],
  })
  return NextResponse.json({ success: true, data: fresh })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const automation = await Automation.findByPk(id)
  if (!automation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Actions cascade-delete via the DB-level FK constraint (onDelete: Cascade).
  await automation.destroy()
  return NextResponse.json({ success: true })
}
