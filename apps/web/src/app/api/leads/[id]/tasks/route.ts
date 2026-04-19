import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { emitEvent, DomainEvents } from '@/lib/domain-events'

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(255),
  type: z.enum(['FOLLOW_UP', 'APPOINTMENT', 'OFFER', 'CALL', 'EMAIL', 'OTHER']),
  dueDate: z.string().datetime().optional(),
  assignedToId: z.string().optional(),
  notes: z.string().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = ((session as any)?.user?.id ?? '') as string

  const { id } = await params
  const body = await req.json()
  const parsed = CreateTaskSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const task = await prisma.task.create({
    data: {
      propertyId: id,
      title: parsed.data.title,
      type: parsed.data.type,
      dueAt: parsed.data.dueDate ? (/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.dueDate) ? new Date(parsed.data.dueDate + 'T12:00:00') : new Date(parsed.data.dueDate)) : undefined,
      assignedToId: parsed.data.assignedToId ?? userId,
      createdById: userId,
      description: parsed.data.notes,
      status: 'PENDING',
    },
  })

  await prisma.property.update({ where: { id }, data: { lastActivityAt: new Date() } }).catch(() => {})

  // Emit domain event
  await emitEvent({
    type: DomainEvents.TASK_CREATED,
    propertyId: id,
    userId,
    actorType: 'user',
    payload: { taskId: task.id, title: parsed.data.title, type: parsed.data.type },
  })

  return NextResponse.json({ success: true, data: task }, { status: 201 })
}
