import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Property, User, Op } from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const ReassignmentEntrySchema = z.object({
  campaignName: z.string(),
  marketId: z.string().nullable(),
  reassignToUserId: z.string().nullable(),
})

const BodySchema = z.object({
  leads: z.array(ReassignmentEntrySchema).default([]),
  buyers: z.array(ReassignmentEntrySchema).default([]),
})

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

  for (const entry of parsed.data.leads) {
    if (!entry.reassignToUserId) continue
    await Property.update(
      { assignedToId: entry.reassignToUserId },
      {
        where: {
          assignedToId: userId,
          campaignName: entry.campaignName,
          ...(entry.marketId ? { marketId: entry.marketId } : {}),
        },
      },
    )
  }

  for (const entry of parsed.data.buyers) {
    if (!entry.reassignToUserId) continue
    await Property.update(
      { dispoAssigneeId: entry.reassignToUserId },
      {
        where: {
          dispoAssigneeId: userId,
          campaignName: entry.campaignName,
          ...(entry.marketId ? { marketId: entry.marketId } : {}),
        },
      },
    )
  }

  await Property.update({ assignedToId: null }, { where: { assignedToId: userId } })
  await Property.update({ dispoAssigneeId: null }, { where: { dispoAssigneeId: userId } })

  try {
    await User.destroy({ where: { id: userId } })
  } catch (err: any) {
    const isFkErr = err?.name === 'SequelizeForeignKeyConstraintError'
      || err?.parent?.code === '23503'
      || err?.original?.code === '23503'
    if (isFkErr) {
      await User.update(
        {
          status: 'INACTIVE',
          email: `deleted-${userId}@removed`,
          name: '[Removed]',
        } as any,
        { where: { id: userId } },
      )
    } else {
      throw err
    }
  }

  return NextResponse.json({ success: true })
}
