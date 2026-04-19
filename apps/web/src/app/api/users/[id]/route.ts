import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'
import { rateLimitMutation } from '@/lib/rate-limit'

const UpdateUserSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  roleId: z.string().optional(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  marketIds: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  vacationMode: z.boolean().optional(),
  vacationStart: z.string().nullable().optional(),
  vacationEnd: z.string().nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimitMutation(req, { bucket: 'users.patch', limit: 30 })
  if (limited) return limited
  const session = await auth()
  const deny = requirePermission(session, 'users.manage')
  if (deny) return deny

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // If email is being changed, check uniqueness
  if (parsed.data.email) {
    const existing = await prisma.user.findFirst({
      where: { email: parsed.data.email, id: { not: id } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
  }

  // Convert vacation date strings to Date objects
  const data: Record<string, unknown> = { ...parsed.data }
  if (typeof data.vacationStart === 'string') data.vacationStart = new Date(data.vacationStart)
  if (typeof data.vacationEnd === 'string') data.vacationEnd = new Date(data.vacationEnd)

  // Note: previous code bumped sessionVersion on permission/role/market/status
  // changes, which force-logged-out the user. We don't need that — the jwt()
  // callback in auth.ts revalidates permissions from DB every 5 min, so
  // changes propagate without breaking sessions. sessionVersion remains
  // available as a dormant kill-switch for future "force logout user X" flows.

  const user = await prisma.user.update({
    where: { id },
    data,
    include: { role: { select: { id: true, name: true, permissions: true } } },
  })

  return NextResponse.json(user)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimitMutation(req, { bucket: 'users.delete', limit: 10 })
  if (limited) return limited
  const session = await auth()
  const deny = requirePermission(session, 'users.manage')
  if (deny) return deny

  const { id } = await params
  const requestingUserId = ((session as any)?.user?.id ?? '') as string
  if (id === requestingUserId) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  try {
    await prisma.user.delete({ where: { id } })
  } catch (err: any) {
    // If FK constraints prevent hard delete, fall back to soft delete
    if (err?.code === 'P2003' || err?.code === 'P2014') {
      await prisma.user.update({
        where: { id },
        data: {
          status: 'INACTIVE',
          email: `deleted-${id}@removed`,
          name: '[Removed]',
        },
      })
    } else {
      throw err
    }
  }

  return new NextResponse(null, { status: 204 })
}
