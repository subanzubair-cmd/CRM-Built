import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import {
  Property,
  PropertyContact,
  Note,
  Task,
  Message,
  ActivityLog,
  Op,
  sequelize,
} from '@crm/database'
import { z } from 'zod'

const MergeSchema = z.object({
  targetId: z.string().min(1),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny
  const sessionUser = (session as any)?.user ?? {}
  const userId = sessionUser.id as string
  const userName = (sessionUser.name ?? 'Unknown') as string

  const { id: sourceId } = await params
  const body = await req.json()
  const parsed = MergeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { targetId } = parsed.data

  if (sourceId === targetId) {
    return NextResponse.json({ error: 'Cannot merge a lead into itself' }, { status: 422 })
  }

  const [source, target] = await Promise.all([
    Property.findByPk(sourceId, { attributes: ['id', 'streetAddress'], raw: true }) as Promise<any>,
    Property.findByPk(targetId, { attributes: ['id', 'streetAddress'], raw: true }) as Promise<any>,
  ])

  if (!source) return NextResponse.json({ error: 'Source lead not found' }, { status: 404 })
  if (!target) return NextResponse.json({ error: 'Target lead not found' }, { status: 404 })

  await sequelize.transaction(async (tx) => {
    const existingContacts = await PropertyContact.findAll({
      where: { propertyId: sourceId },
      attributes: ['contactId'],
      transaction: tx,
      raw: true,
    }) as unknown as Array<{ contactId: string }>
    const existingContactIds = new Set(existingContacts.map((c) => c.contactId))

    const targetContacts = await PropertyContact.findAll({
      where: { propertyId: targetId },
      transaction: tx,
    })
    for (const pc of targetContacts) {
      const plain = pc.get({ plain: true }) as any
      if (existingContactIds.has(plain.contactId)) {
        await pc.destroy({ transaction: tx })
      } else {
        await pc.update({ propertyId: sourceId }, { transaction: tx })
      }
    }

    await Note.update(
      { propertyId: sourceId },
      { where: { propertyId: targetId }, transaction: tx },
    )
    await Task.update(
      { propertyId: sourceId },
      { where: { propertyId: targetId }, transaction: tx },
    )
    await Message.update(
      { propertyId: sourceId },
      { where: { propertyId: targetId }, transaction: tx },
    )
    await ActivityLog.update(
      { propertyId: sourceId },
      { where: { propertyId: targetId }, transaction: tx },
    )

    await Property.update(
      { leadStatus: 'DEAD' },
      { where: { id: targetId }, transaction: tx },
    )

    await ActivityLog.create({
      propertyId: sourceId,
      userId,
      userName,
      action: 'LEAD_MERGED',
      detail: {
        description: `Merged with ${target.streetAddress ?? 'Unknown Address'}`,
        mergedLeadId: targetId,
      },
    } as any, { transaction: tx })
  })

  return NextResponse.json({ success: true }, { status: 200 })
}
