'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Circle, CheckCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Task {
  id: string
  title: string
  type: string
  status: string
  dueAt: Date | null
  assignedTo: { name: string } | null
}

interface Props {
  propertyId: string
  tasks: Task[]
}

export function TasksCard({ propertyId, tasks }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)

  const pendingTasks = tasks.filter((t) => t.status === 'PENDING')
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED')

  async function completeTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    })
    startTransition(() => router.refresh())
  }

  async function handleAddTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const dueDateVal = fd.get('dueDate') as string
    await fetch(`/api/leads/${propertyId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: fd.get('title'),
        type: fd.get('type'),
        dueDate: dueDateVal ? new Date(dueDateVal).toISOString() : undefined,
      }),
    })
    setShowForm(false)
    startTransition(() => router.refresh())
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">
          Tasks{pendingTasks.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px]">
              {pendingTasks.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          + Add Task
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAddTask} className="mb-3 border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Task</label>
            <input name="title" required placeholder="Follow up call" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select name="type" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm">
                <option value="FOLLOW_UP">Follow Up</option>
                <option value="CALL">Call</option>
                <option value="APPOINTMENT">Appointment</option>
                <option value="OFFER">Offer</option>
                <option value="EMAIL">Email</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
              <input name="dueDate" type="datetime-local" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 transition-colors active:scale-95">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 transition-colors">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {pendingTasks.length === 0 && !showForm && (
          <p className="text-sm text-gray-400">No open tasks</p>
        )}
        {pendingTasks.map((task) => (
          <div key={task.id} className="flex items-start gap-2">
            <button onClick={() => completeTask(task.id)} className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-emerald-500 transition-colors">
              <Circle className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 leading-tight">{task.title}</p>
              <p className="text-[11px] text-gray-400">
                {task.type.replace(/_/g, ' ')}
                {task.dueAt && ` · due ${formatDistanceToNow(new Date(task.dueAt), { addSuffix: true })}`}
                {task.assignedTo && ` · ${task.assignedTo.name}`}
              </p>
            </div>
          </div>
        ))}

        {completedTasks.length > 0 && (
          <details className="mt-2">
            <summary className="text-[11px] text-gray-400 cursor-pointer">
              {completedTasks.length} completed
            </summary>
            <div className="mt-2 space-y-1.5">
              {completedTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 opacity-50">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <p className="text-sm text-gray-600 line-through">{task.title}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
