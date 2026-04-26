import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Template } from '@crm/database'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  category: z.string().max(64).nullable().optional(),
  subject: z.string().max(256).nullable().optional(),
  bodyContent: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
})

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  const { id } = await params
  const template = await Template.findByPk(id)
  if (!template) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(template)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const template = await Template.findByPk(id)
  if (!template) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = UpdateTemplateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  await template.update(parsed.data)

  return NextResponse.json({ success: true, data: template })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const template = await Template.findByPk(id)
  if (!template) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await template.destroy()
  return NextResponse.json({ success: true })
}
