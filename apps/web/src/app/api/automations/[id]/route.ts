import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'
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
  const automation = await prisma.automation.findUnique({
    where: { id },
    include: { actions: { orderBy: { order: 'asc' } } },
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
  const existing = await prisma.automation.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = UpdateAutomationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { actions, conditions, ...fields } = parsed.data

  const automation = await prisma.$transaction(async (tx) => {
    if (actions !== undefined) {
      await tx.automationAction.deleteMany({ where: { automationId: id } })
    }

    return tx.automation.update({
      where: { id },
      data: {
        ...fields,
        ...(conditions !== undefined
          ? { conditions: conditions as Prisma.InputJsonValue }
          : {}),
        ...(actions !== undefined
          ? {
              actions: {
                create: actions.map((a) => ({
                  order: a.order,
                  actionType: a.actionType,
                  config: a.config as Prisma.InputJsonValue,
                })),
              },
            }
          : {}),
      },
      include: { actions: { orderBy: { order: 'asc' } } },
    })
  })

  return NextResponse.json({ success: true, data: automation })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const existing = await prisma.automation.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Actions cascade-delete via schema onDelete: Cascade
  await prisma.automation.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
