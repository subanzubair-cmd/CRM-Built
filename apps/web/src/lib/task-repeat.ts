import { Task } from '@crm/database'

/**
 * When a repeating task is completed, spawn the next instance based on
 * Task.repeatType and Task.repeatConfigJson.
 *
 * Supported repeat types:
 *   - 'daily'    — +1 day from the completed dueAt
 *   - 'weekly'   — +7 days
 *   - 'monthly'  — +1 month (preserves day-of-month where possible)
 *   - 'custom'   — reads { intervalDays } from repeatConfigJson
 *
 * The new task copies title/description/type/priority/dueTime/assignedToId/
 * propertyId/repeatType/repeatConfigJson from the completed one.
 * Silent on non-repeating or unknown types.
 */
export async function scheduleNextRepeat(taskId: string): Promise<void> {
  try {
    const task = await Task.findByPk(taskId, {
      attributes: [
        'id',
        'title',
        'description',
        'type',
        'priority',
        'dueAt',
        'dueTime',
        'assignedToId',
        'createdById',
        'propertyId',
        'repeatType',
        'repeatConfigJson',
        'templateId',
        'sourceType',
      ],
    })
    if (!task) return
    if (!task.repeatType || task.repeatType === 'none') return
    if (!task.dueAt) return

    const nextDue = computeNextDueAt(task.dueAt, task.repeatType, task.repeatConfigJson)
    if (!nextDue) return

    await Task.create({
      title: task.title,
      description: task.description ?? null,
      type: task.type,
      priority: task.priority,
      dueAt: nextDue,
      dueTime: task.dueTime ?? null,
      assignedToId: task.assignedToId ?? null,
      createdById: task.createdById ?? null,
      propertyId: task.propertyId ?? null,
      repeatType: task.repeatType,
      repeatConfigJson: task.repeatConfigJson ?? null,
      templateId: task.templateId ?? null,
      sourceType: 'repeat',
      status: 'PENDING',
    })
  } catch (err) {
    console.error('[task-repeat] scheduleNextRepeat failed:', err)
  }
}

function computeNextDueAt(
  currentDue: Date,
  repeatType: string,
  repeatConfigJson: unknown,
): Date | null {
  const cfg = (repeatConfigJson ?? {}) as Record<string, unknown>
  const next = new Date(currentDue)
  switch (repeatType) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      return next
    case 'weekly':
      next.setDate(next.getDate() + 7)
      return next
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      return next
    case 'custom': {
      const intervalDays = Number(cfg.intervalDays ?? 0)
      if (!Number.isFinite(intervalDays) || intervalDays <= 0) return null
      next.setDate(next.getDate() + intervalDays)
      return next
    }
    default:
      return null
  }
}
