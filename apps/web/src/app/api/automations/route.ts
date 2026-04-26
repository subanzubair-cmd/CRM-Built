import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Automation, AutomationAction, sequelize } from '@crm/database'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth-utils'

const AutomationActionSchema = z.object({
  order: z.number().int().min(0),
  actionType: z.enum([
    'SEND_SMS', 'SEND_EMAIL', 'SEND_RVM', 'ADD_TAG',
    'CHANGE_STAGE', 'ASSIGN_USER', 'CREATE_TASK', 'ENROLL_CAMPAIGN',
  ]),
  config: z.record(z.unknown()).default({}),
})

const CreateAutomationSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().optional(),
  trigger: z.enum([
    'STAGE_CHANGE', 'LEAD_CREATED', 'TAG_ADDED',
    'NO_CONTACT_X_DAYS', 'OFFER_MADE', 'UNDER_CONTRACT', 'MANUAL',
  ]),
  conditions: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
  actions: z.array(AutomationActionSchema).default([]),
})

export async function GET() {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  const automations = await Automation.findAll({
    include: [{ model: AutomationAction, as: 'actions', separate: true, order: [['order', 'ASC']] }],
    order: [['createdAt', 'DESC']],
  })
  return NextResponse.json(automations)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const body = await req.json()
  const parsed = CreateAutomationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { actions, ...automationData } = parsed.data

  // Sequelize doesn't natively do nested-create with the same shape as
  // Prisma. Wrap in a transaction so the parent + actions either all
  // commit or all roll back.
  const automation = await sequelize.transaction(async (t) => {
    const created = await Automation.create(automationData, { transaction: t })
    if (actions.length > 0) {
      await AutomationAction.bulkCreate(
        actions.map((a) => ({
          automationId: created.id,
          order: a.order,
          actionType: a.actionType,
          config: a.config,
        })),
        { transaction: t },
      )
    }
    return created
  })

  // Re-read with eager-loaded actions so the response matches the
  // original Prisma `include`.
  const fresh = await Automation.findByPk(automation.id, {
    include: [{ model: AutomationAction, as: 'actions', separate: true, order: [['order', 'ASC']] }],
  })

  return NextResponse.json({ success: true, data: fresh }, { status: 201 })
}
