import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

const VALID_EVENTS = [
  'lead.created',
  'lead.updated',
  'lead.status_changed',
  'task.created',
  'task.completed',
  'communication.logged',
] as const

const UpdateWebhookSchema = z.object({
  friendlyName: z.string().min(1).max(128).trim().optional(),
  endpointUrl: z.string().url().optional(),
  events: z.array(z.enum(VALID_EVENTS)).min(1).optional(),
  state: z.enum(['active', 'inactive']).optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateWebhookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const webhook = await prisma.webhook.findUnique({ where: { id } })
  if (!webhook) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.webhook.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ data: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const webhook = await prisma.webhook.findUnique({ where: { id } })
  if (!webhook) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.webhook.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
