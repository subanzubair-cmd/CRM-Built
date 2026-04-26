import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { StatusAutomation } from '@crm/database'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth-utils'

const CreateStatusAutomationSchema = z.object({
  workspaceType: z.enum(['leads', 'tm', 'inventory', 'sold', 'rental']),
  stageCode: z.string().min(1).max(64),
  dripCampaignId: z.string().nullable().optional(),
  taskTemplateId: z.string().nullable().optional(),
  taskTitle: z.string().nullable().optional(),
  taskAssigneeId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  const sp = req.nextUrl.searchParams
  const workspaceType = sp.get('workspaceType') ?? undefined
  const ALLOWED_WORKSPACES = ['leads', 'tm', 'inventory', 'sold', 'rental'] as const
  type WorkspaceType = typeof ALLOWED_WORKSPACES[number]
  const wt = workspaceType && ALLOWED_WORKSPACES.includes(workspaceType as WorkspaceType)
    ? (workspaceType as WorkspaceType)
    : undefined

  const automations = await StatusAutomation.findAll({
    where: wt ? { workspaceType: wt } : undefined,
    order: [['createdAt', 'ASC']],
  })

  return NextResponse.json(automations)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const body = await req.json()
  const parsed = CreateStatusAutomationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  // Composite-unique upsert on (workspaceType, stageCode).
  const [automation, created] = await StatusAutomation.findOrCreate({
    where: {
      workspaceType: parsed.data.workspaceType,
      stageCode: parsed.data.stageCode,
    },
    defaults: parsed.data,
  })
  if (!created) {
    await automation.update({
      dripCampaignId: parsed.data.dripCampaignId ?? null,
      taskTemplateId: parsed.data.taskTemplateId ?? null,
      taskTitle: parsed.data.taskTitle ?? null,
      taskAssigneeId: parsed.data.taskAssigneeId ?? null,
      isActive: parsed.data.isActive,
    })
  }

  return NextResponse.json({ success: true, data: automation }, { status: 201 })
}
