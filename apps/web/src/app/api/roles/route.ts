import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth-utils'

const CreateRoleSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
})

export async function GET() {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  const roles = await prisma.role.findMany({
    select: { id: true, name: true, description: true, permissions: true, isSystem: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(roles)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const body = await req.json()
  const parsed = CreateRoleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const existing = await prisma.role.findUnique({ where: { name: parsed.data.name } })
  if (existing) return NextResponse.json({ error: 'Role name already in use' }, { status: 409 })

  const role = await prisma.role.create({ data: parsed.data })
  return NextResponse.json({ success: true, data: role }, { status: 201 })
}
