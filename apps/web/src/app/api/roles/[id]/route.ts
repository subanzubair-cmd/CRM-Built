import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

const UpdateRoleSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateRoleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const role = await prisma.role.findUnique({ where: { id } })
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (role.isSystem) return NextResponse.json({ error: 'System roles cannot be modified' }, { status: 403 })

  const updated = await prisma.role.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const { id } = await params

  const role = await prisma.role.findUnique({ where: { id } })
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (role.isSystem) return NextResponse.json({ error: 'System roles cannot be deleted' }, { status: 403 })

  await prisma.role.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
