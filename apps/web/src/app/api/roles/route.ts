import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Role, literal } from '@crm/database'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth-utils'

const CreateRoleSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  // `?withUsers=true` filters down to roles that actually have at
  // least one ACTIVE user assigned. The drip-campaign Task editor
  // uses this so the responsibility dropdown doesn't list roles like
  // "Bookkeeper" when no Bookkeeper user exists yet — the spec calls
  // for "roles that have at least one user".
  const withUsers = req.nextUrl.searchParams.get('withUsers') === 'true'

  const where = withUsers
    ? literal(
        `"Role"."id" IN (SELECT DISTINCT "roleId" FROM "User" WHERE "roleId" IS NOT NULL AND "status" = 'ACTIVE')`,
      )
    : undefined

  const roles = await Role.findAll({
    attributes: ['id', 'name', 'description', 'permissions', 'isSystem'],
    where: where as any,
    order: [['name', 'ASC']],
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

  const existing = await Role.findOne({ where: { name: parsed.data.name } })
  if (existing) return NextResponse.json({ error: 'Role name already in use' }, { status: 409 })

  const role = await Role.create(parsed.data)
  return NextResponse.json({ success: true, data: role }, { status: 201 })
}
