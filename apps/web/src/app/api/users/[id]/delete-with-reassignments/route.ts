import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const ReassignmentEntrySchema = z.object({
  campaignName: z.string(),
  marketId: z.string().nullable(),
  reassignToUserId: z.string().nullable(), // null = don't reassign
})

const BodySchema = z.object({
  leads: z.array(ReassignmentEntrySchema).default([]),
  buyers: z.array(ReassignmentEntrySchema).default([]),
})

/**
 * POST /api/users/[id]/delete-with-reassignments
 *
 * Performs reassignments of leads and buyers from the deleted user to selected
 * users per campaign/market, then deletes the user.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'users.manage')
  if (deny) return deny

  const { id: userId } = await params
  const requestingUserId = ((session as any)?.user?.id ?? '') as string
  if (userId === requestingUserId) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Leads reassignment (assignedToId)
  for (const entry of parsed.data.leads) {
    if (!entry.reassignToUserId) continue
    await prisma.property.updateMany({
      where: {
        assignedToId: userId,
        campaignName: entry.campaignName,
        ...(entry.marketId ? { marketId: entry.marketId } : {}),
      },
      data: { assignedToId: entry.reassignToUserId },
    })
  }

  // Buyers reassignment (dispoAssigneeId)
  for (const entry of parsed.data.buyers) {
    if (!entry.reassignToUserId) continue
    await prisma.property.updateMany({
      where: {
        dispoAssigneeId: userId,
        campaignName: entry.campaignName,
        ...(entry.marketId ? { marketId: entry.marketId } : {}),
      },
      data: { dispoAssigneeId: entry.reassignToUserId },
    })
  }

  // Any remaining properties still assigned to the user (user chose "don't reassign")
  // — set assignedToId / dispoAssigneeId to null so we can delete the user
  await prisma.property.updateMany({
    where: { assignedToId: userId },
    data: { assignedToId: null },
  })
  await prisma.property.updateMany({
    where: { dispoAssigneeId: userId },
    data: { dispoAssigneeId: null },
  })

  // Delete the user
  try {
    await prisma.user.delete({ where: { id: userId } })
  } catch (err: any) {
    if (err?.code === 'P2003' || err?.code === 'P2014') {
      // Fall back to soft-delete if FKs block
      await prisma.user.update({
        where: { id: userId },
        data: {
          status: 'INACTIVE',
          email: `deleted-${userId}@removed`,
          name: '[Removed]',
        },
      })
    } else {
      throw err
    }
  }

  return NextResponse.json({ success: true })
}
