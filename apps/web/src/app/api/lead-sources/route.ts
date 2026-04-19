import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'

const CreateLeadSourceSchema = z.object({
  name: z.string().min(1).max(120).trim(),
})

/**
 * GET /api/lead-sources
 * List all lead sources, ordered by name asc.
 */
export async function GET() {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  const sources = await (prisma as any).leadSource.findMany({
    select: { id: true, name: true, isActive: true, isSystem: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ data: sources })
}

/**
 * POST /api/lead-sources
 * Creates a new non-system lead source.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const body = await req.json()
  const parsed = CreateLeadSourceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const existing = await (prisma as any).leadSource.findUnique({
    where: { name: parsed.data.name },
  })
  if (existing) {
    return NextResponse.json({ error: 'Lead source already exists' }, { status: 409 })
  }

  const source = await (prisma as any).leadSource.create({
    data: {
      name: parsed.data.name,
      isActive: true,
      isSystem: false,
    },
    select: { id: true, name: true, isActive: true, isSystem: true },
  })

  return NextResponse.json({ data: source }, { status: 201 })
}
