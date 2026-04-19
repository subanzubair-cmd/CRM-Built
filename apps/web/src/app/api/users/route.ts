import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { getUserList } from '@/lib/settings'
import { requirePermission } from '@/lib/auth-utils'

const InviteUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  roleId: z.string().min(1),
  permissions: z.array(z.string()).optional(),
  marketIds: z.array(z.string()).optional(),
  // ── new ──
  password: z.string().min(8).optional(),       // admin sets password directly
  sendInviteEmail: z.boolean().optional(),      // send a "set your password" link instead
})

export async function GET() {
  const session = await auth()
  const deny = requirePermission(session, 'users.view')
  if (deny) return deny

  const users = await getUserList()
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'users.manage')
  if (deny) return deny

  const body = await req.json()
  const parsed = InviteUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 })

  // Determine password handling
  let passwordHash: string
  let status: 'ACTIVE' | 'INVITED'
  let inviteToken: string | null = null

  if (parsed.data.password) {
    // Admin-set password — user is immediately ACTIVE
    passwordHash = await bcrypt.hash(parsed.data.password, 12)
    status = 'ACTIVE'
  } else {
    // Send-invite-link flow — generate a random token, store its hash as the
    // password placeholder, mark user as INVITED. The /set-password page
    // verifies the token and lets the user create their real password.
    inviteToken = randomBytes(32).toString('hex')
    passwordHash = `INVITE:${await bcrypt.hash(inviteToken, 10)}`
    status = 'INVITED'
  }

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      roleId: parsed.data.roleId,
      permissions: parsed.data.permissions ?? [],
      marketIds: parsed.data.marketIds ?? [],
      passwordHash,
      status,
    },
    include: { role: { select: { id: true, name: true } } },
  })

  // Build the invite link (the actual /set-password page is a future build).
  // For now we just return it so the admin UI can show it / log it.
  const inviteLink = inviteToken
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/set-password?token=${inviteToken}&email=${encodeURIComponent(parsed.data.email)}`
    : null

  // TODO: when email-adapter is wired into the web app, send the invite link via email here.
  if (inviteLink) {
    console.log(`[users] Invite link for ${parsed.data.email}: ${inviteLink}`)
  }

  return NextResponse.json({ ...user, inviteLink }, { status: 201 })
}
