import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
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

  const note = await prisma.note.create({
    data: {
      propertyId: id,
      authorId: userId,
      body: parsed.data.content,
    },
  })

  await Promise.all([
    prisma.activityLog.create({
      data: {
        propertyId: id,
        userId,
        action: 'NOTE_ADDED',
        detail: { description: 'Note added' },
      },
    }),
    prisma.property.update({ where: { id }, data: { lastActivityAt: new Date() } }),
  ])

  return NextResponse.json({ success: true, data: note }, { status: 201 })
}
