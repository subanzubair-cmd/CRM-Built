import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { LeadSource } from '@crm/database'
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

  const sources = await LeadSource.findAll({
    attributes: ['id', 'name', 'isActive', 'isSystem'],
    order: [['name', 'ASC']],
    raw: true,
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

  const existing = await LeadSource.findOne({
    where: { name: parsed.data.name },
    attributes: ['id'],
  })
  if (existing) {
    return NextResponse.json({ error: 'Lead source already exists' }, { status: 409 })
  }

  const source = await LeadSource.create({
    name: parsed.data.name,
    isActive: true,
    isSystem: false,
  })

  return NextResponse.json(
    {
      data: {
        id: source.id,
        name: source.name,
        isActive: source.isActive,
        isSystem: source.isSystem,
      },
    },
    { status: 201 },
  )
}
