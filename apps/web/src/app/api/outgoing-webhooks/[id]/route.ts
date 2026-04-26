import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Webhook } from '@crm/database'
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

  const webhook = await Webhook.findByPk(id)
  if (!webhook) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // events comes through as a readonly tuple from zod's enum.array; cast to a
  // mutable string[] for Sequelize's TEXT[] column.
  const updates: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.events) updates.events = [...parsed.data.events]

  await webhook.update(updates)
  return NextResponse.json({ data: webhook })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const webhook = await Webhook.findByPk(id)
  if (!webhook) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await webhook.destroy()
  return NextResponse.json({ success: true })
}
