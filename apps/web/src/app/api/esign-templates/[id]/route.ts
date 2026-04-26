import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { EsignTemplate } from '@crm/database'

type Params = { params: Promise<{ id: string }> }

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'archived']).optional(),
  documentUrl: z.string().url().optional().nullable(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateTemplateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const template = await EsignTemplate.findByPk(id)
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await template.update(parsed.data)
  return NextResponse.json(template)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Soft delete: set status to archived
  const template = await EsignTemplate.findByPk(id)
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await template.update({ status: 'archived' })

  return NextResponse.json(template)
}
