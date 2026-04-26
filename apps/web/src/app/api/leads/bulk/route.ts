import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import {
  Property,
  ActivityLog,
  Op,
  sequelize,
} from '@crm/database'
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
    const properties = await Property.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ['id', 'tags'],
      raw: true,
    }) as unknown as Array<{ id: string; tags: string[] | null }>

    await sequelize.transaction(async (tx) => {
      for (const p of properties) {
        const merged = Array.from(new Set([...(p.tags ?? []), ...tags]))
        await Property.update({ tags: merged }, { where: { id: p.id }, transaction: tx })
        await ActivityLog.create({
          propertyId: p.id,
          userId,
          action: 'TAG_ADDED',
          detail: { description: `Bulk added tags: ${tags.join(', ')}` },
        } as any, { transaction: tx })
      }
    })
    return NextResponse.json({ success: true, updated: properties.length })
  }

  if (action === 'removeTags' && tags && tags.length > 0) {
    const properties = await Property.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ['id', 'tags'],
      raw: true,
    }) as unknown as Array<{ id: string; tags: string[] | null }>

    await sequelize.transaction(async (tx) => {
      for (const p of properties) {
        const filtered = (p.tags ?? []).filter((t) => !tags.includes(t))
        await Property.update({ tags: filtered }, { where: { id: p.id }, transaction: tx })
        await ActivityLog.create({
          propertyId: p.id,
          userId,
          action: 'TAG_REMOVED',
          detail: { description: `Bulk removed tags: ${tags.join(', ')}` },
        } as any, { transaction: tx })
      }
    })
    return NextResponse.json({ success: true, updated: properties.length })
  }

  if (action === 'assign' && assignedToId) {
    await Property.update({ assignedToId }, { where: { id: { [Op.in]: ids } } })
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

  await sequelize.transaction(async (tx) => {
    await Property.update({ leadStatus: 'DEAD' }, { where: { id: { [Op.in]: ids } }, transaction: tx })
    await ActivityLog.bulkCreate(
      ids.map((id) => ({
        propertyId: id,
        userId,
        action: 'LEAD_DELETED',
        detail: { description: 'Bulk deleted (moved to Dead)' },
      })) as any[],
      { transaction: tx },
    )
  })

  return NextResponse.json({ success: true, deleted: ids.length })
}
