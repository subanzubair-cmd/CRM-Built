import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
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
    prisma.property.findUnique({ where: { id: sourceId }, select: { id: true, streetAddress: true } }),
    prisma.property.findUnique({ where: { id: targetId }, select: { id: true, streetAddress: true } }),
  ])

  if (!source) return NextResponse.json({ error: 'Source lead not found' }, { status: 404 })
  if (!target) return NextResponse.json({ error: 'Target lead not found' }, { status: 404 })

  // Move all related records from target to source in a transaction
  await prisma.$transaction(async (tx) => {
    // 1. Move PropertyContacts (skip duplicates via unique constraint)
    const existingContacts = await tx.propertyContact.findMany({
      where: { propertyId: sourceId },
      select: { contactId: true },
    })
    const existingContactIds = new Set(existingContacts.map((c) => c.contactId))

    const targetContacts = await tx.propertyContact.findMany({
      where: { propertyId: targetId },
    })
    for (const pc of targetContacts) {
      if (existingContactIds.has(pc.contactId)) {
        // Already linked to source — delete the duplicate join record
        await tx.propertyContact.delete({ where: { id: pc.id } })
      } else {
        await tx.propertyContact.update({
          where: { id: pc.id },
          data: { propertyId: sourceId },
        })
      }
    }

    // 2. Move Notes
    await tx.note.updateMany({
      where: { propertyId: targetId },
      data: { propertyId: sourceId },
    })

    // 3. Move Tasks
    await tx.task.updateMany({
      where: { propertyId: targetId },
      data: { propertyId: sourceId },
    })

    // 4. Move Messages
    await tx.message.updateMany({
      where: { propertyId: targetId },
      data: { propertyId: sourceId },
    })

    // 5. Move ActivityLogs
    await tx.activityLog.updateMany({
      where: { propertyId: targetId },
      data: { propertyId: sourceId },
    })

    // 6. Soft-delete target lead (set status = DEAD)
    await tx.property.update({
      where: { id: targetId },
      data: { leadStatus: 'DEAD' },
    })

    // 7. Create activity log on source
    await tx.activityLog.create({
      data: {
        propertyId: sourceId,
        userId,
        userName,
        action: 'LEAD_MERGED',
        detail: {
          description: `Merged with ${target.streetAddress ?? 'Unknown Address'}`,
          mergedLeadId: targetId,
        },
      },
    })
  })

  return NextResponse.json({ success: true }, { status: 200 })
}
