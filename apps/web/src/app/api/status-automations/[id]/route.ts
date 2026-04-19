import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

const UpdateStatusAutomationSchema = z.object({
  dripCampaignId: z.string().nullable().optional(),
  taskTemplateId: z.string().nullable().optional(),
  taskTitle: z.string().nullable().optional(),
  taskAssigneeId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const existing = await prisma.statusAutomation.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = UpdateStatusAutomationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const automation = await prisma.statusAutomation.update({
    where: { id },
    data: parsed.data,
  })

  return NextResponse.json({ success: true, data: automation })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const existing = await prisma.statusAutomation.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.statusAutomation.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
