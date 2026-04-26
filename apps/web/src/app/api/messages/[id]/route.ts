import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Message } from '@crm/database'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const UpdateSchema = z.object({
  body: z.string().min(1).max(10000),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = UpdateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const msg = await Message.findByPk(id)
  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  await msg.update({ body: parsed.data.body })
  return NextResponse.json({ success: true, data: msg })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const count = await Message.destroy({ where: { id } })
  if (count === 0) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
