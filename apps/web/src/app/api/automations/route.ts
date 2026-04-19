import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'
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

  const automations = await prisma.automation.findMany({
    include: { actions: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'desc' },
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

  const automation = await prisma.automation.create({
    data: {
      ...automationData,
      conditions: automationData.conditions as Prisma.InputJsonValue,
      actions: {
        create: actions.map((a) => ({
          order: a.order,
          actionType: a.actionType,
          config: a.config as Prisma.InputJsonValue,
        })),
      },
    },
    include: { actions: { orderBy: { order: 'asc' } } },
  })

  return NextResponse.json({ success: true, data: automation }, { status: 201 })
}
