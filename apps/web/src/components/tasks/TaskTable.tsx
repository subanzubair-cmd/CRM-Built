'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Circle } from 'lucide-react'

interface TaskRow {
  id: string
  title: string
  type: string
  status: string
  dueAt: Date | null
  assignedTo: { name: string } | null
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    state: string | null
    leadType: string
  } | null
}

interface Props {
  rows: TaskRow[]
  total: number
}

export function TaskTable({ rows, total }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  async function completeTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    })
    startTransition(() => router.refresh())
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No open tasks — all clear!</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
        {total} open task{total !== 1 ? 's' : ''}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
            <th className="w-10 px-4 py-2.5"></th>
            <th className="text-left px-4 py-2.5">Task</th>
            <th className="text-left px-4 py-2.5">Property</th>
            <th className="text-left px-4 py-2.5">Assigned</th>
            <th className="text-left px-4 py-2.5">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((task) => {
            const pipeline = task.property?.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
            const isOverdue = task.dueAt && new Date(task.dueAt) < new Date()
            return (
              <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <button
                    onClick={() => completeTask(task.id)}
                    className="text-gray-300 hover:text-emerald-500 transition-colors"
                    title="Mark complete"
                  >
                    <Circle className="w-4 h-4" />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{task.title}</p>
                  <p className="text-[11px] text-gray-400">{task.type.replace(/_/g, ' ')}</p>
                </td>
                <td className="px-4 py-3">
                  {task.property ? (
                    <button
                      onClick={() => router.push(`/leads/${pipeline}/${task.property!.id}`)}
                      className="text-left hover:text-blue-600 transition-colors"
                    >
                      <p className="text-gray-800">{task.property.streetAddress ?? 'Unknown'}</p>
                      <p className="text-[11px] text-gray-400">
                        {[task.property.city, task.property.state, (task.property as any).zip].filter(Boolean).join(', ')}
                      </p>
                    </button>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{task.assignedTo?.name ?? <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3">
                  {task.dueAt ? (
                    <span className={`text-[11px] ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {formatDistanceToNow(new Date(task.dueAt), { addSuffix: true })}
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
