import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Task } from '@crm/database'
import { z } from 'zod'
import { emitEvent, DomainEvents } from '@/lib/domain-events'
import { scheduleNextRepeat } from '@/lib/task-repeat'

const UpdateTaskSchema = z.object({
  status: z.enum(['COMPLETED', 'CANCELLED']),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateTaskSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const task = await Task.findByPk(id)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await task.update({
    status: parsed.data.status,
    completedAt: parsed.data.status === 'COMPLETED' ? new Date() : null,
  })

  if (parsed.data.status === 'COMPLETED') {
    const userId = ((session as any)?.user?.id ?? '') as string
    await emitEvent({
      type: DomainEvents.TASK_COMPLETED,
      propertyId: task.propertyId ?? undefined,
      userId,
      actorType: 'user',
      payload: { taskId: task.id, title: task.title },
    })

    // If the task has a repeat rule, schedule the next instance
    void scheduleNextRepeat(task.id)
  }

  return NextResponse.json({ success: true, data: task })
}
