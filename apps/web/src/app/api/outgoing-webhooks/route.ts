import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth-utils'

const VALID_EVENTS = [
  'lead.created',
  'lead.updated',
  'lead.status_changed',
  'task.created',
  'task.completed',
  'communication.logged',
] as const

const CreateWebhookSchema = z.object({
  friendlyName: z.string().min(1).max(128).trim(),
  endpointUrl: z.string().url(),
  events: z.array(z.enum(VALID_EVENTS)).min(1, 'Select at least one event'),
})

export async function GET(_req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const webhooks = await prisma.webhook.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ data: webhooks })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const body = await req.json()
  const parsed = CreateWebhookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const webhook = await prisma.webhook.create({
    data: {
      friendlyName: parsed.data.friendlyName,
      endpointUrl: parsed.data.endpointUrl,
      events: parsed.data.events,
    },
  })

  return NextResponse.json({ data: webhook }, { status: 201 })
}
