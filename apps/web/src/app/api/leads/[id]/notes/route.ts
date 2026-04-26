import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  Note,
  ActivityLog,
  Property,
  sequelize,
} from '@crm/database'
import { z } from 'zod'

const CreateNoteSchema = z.object({
  content: z.string().min(1).max(5000),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params
  const body = await req.json()
  const parsed = CreateNoteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  // Wrap the three writes in a transaction so the note + activity log
  // entry + lastActivityAt bump either all commit or all roll back.
  // Matches the Prisma `Promise.all` semantics with stronger atomicity.
  const note = await sequelize.transaction(async (tx) => {
    const created = await Note.create(
      {
        propertyId: id,
        authorId: userId,
        body: parsed.data.content,
      },
      { transaction: tx },
    )
    await ActivityLog.create(
      {
        propertyId: id,
        userId,
        action: 'NOTE_ADDED',
        detail: { description: 'Note added' },
      },
      { transaction: tx },
    )
    await Property.update(
      { lastActivityAt: new Date() },
      { where: { id }, transaction: tx },
    )
    return created
  })

  return NextResponse.json({ success: true, data: note }, { status: 201 })
}
