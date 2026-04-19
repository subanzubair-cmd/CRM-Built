import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/rate-limit'

const BulkUpdateSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  action: z.enum(['addTags', 'removeTags', 'assign']),
  tags: z.array(z.string()).optional(),
  assignedToId: z.string().optional(),
})

const BulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
})

export async function PATCH(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny
  const sessionUser = (session as any)?.user ?? {}
  const userId = (sessionUser.id ?? '') as string

  const body = await req.json()
  const parsed = BulkUpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { ids, action, tags, assignedToId } = parsed.data

  if (action === 'addTags' && tags && tags.length > 0) {
    const properties = await prisma.property.findMany({
      where: { id: { in: ids } },
      select: { id: true, tags: true },
    })
    await Promise.all(
      properties.map((p) => {
        const merged = [...new Set([...p.tags, ...tags])]
        return prisma.property.update({
          where: { id: p.id },
          data: {
            tags: merged,
            activityLogs: {
              create: { userId, action: 'TAG_ADDED', detail: { description: `Bulk added tags: ${tags.join(', ')}` } },
            },
          },
        })
      })
    )
    return NextResponse.json({ success: true, updated: properties.length })
  }

  if (action === 'removeTags' && tags && tags.length > 0) {
    const properties = await prisma.property.findMany({
      where: { id: { in: ids } },
      select: { id: true, tags: true },
    })
    await Promise.all(
      properties.map((p) => {
        const filtered = p.tags.filter((t) => !tags.includes(t))
        return prisma.property.update({
          where: { id: p.id },
          data: {
            tags: filtered,
            activityLogs: {
              create: { userId, action: 'TAG_REMOVED', detail: { description: `Bulk removed tags: ${tags.join(', ')}` } },
            },
          },
        })
      })
    )
    return NextResponse.json({ success: true, updated: properties.length })
  }

  if (action === 'assign' && assignedToId) {
    await prisma.property.updateMany({
      where: { id: { in: ids } },
      data: { assignedToId },
    })
    return NextResponse.json({ success: true, updated: ids.length })
  }

  return NextResponse.json({ error: 'Invalid action or missing params' }, { status: 422 })
}

export async function DELETE(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const session = await auth()
  const deny = requirePermission(session, 'leads.delete')
  if (deny) return deny
  const sessionUser = (session as any)?.user ?? {}
  const userId = (sessionUser.id ?? '') as string

  const body = await req.json()
  const parsed = BulkDeleteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { ids } = parsed.data

  await Promise.all(
    ids.map((id) =>
      prisma.property.update({
        where: { id },
        data: {
          leadStatus: 'DEAD',
          activityLogs: {
            create: { userId, action: 'LEAD_DELETED', detail: { description: 'Bulk deleted (moved to Dead)' } },
          },
        },
      })
    )
  )

  return NextResponse.json({ success: true, deleted: ids.length })
}
