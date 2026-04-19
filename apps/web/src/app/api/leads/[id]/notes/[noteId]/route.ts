import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

type Params = { params: Promise<{ id: string; noteId: string }> }

const UpdateSchema = z.object({
  body: z.string().min(1),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny

  const { noteId } = await params
  const parsed = UpdateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const note = await prisma.note.update({
    where: { id: noteId },
    data: { body: parsed.data.body },
  })

  return NextResponse.json({ success: true, data: note })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.delete')
  if (deny) return deny

  const { noteId } = await params
  await prisma.note.delete({ where: { id: noteId } })

  return NextResponse.json({ success: true })
}
