import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getTaskList } from '@/lib/tasks'
import { TaskTable } from '@/components/tasks/TaskTable'

export const metadata = { title: 'Tasks' }

interface PageProps {
  searchParams: Promise<{ overdue?: string; dueToday?: string; assignedToId?: string; page?: string }>
}

export default async function TasksPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams

  const [{ rows, total }, { total: overdueCount }] = await Promise.all([
    getTaskList({
      assignedToId: sp.assignedToId,
      overdue: sp.overdue === '1',
      dueToday: sp.dueToday === '1',
      page: sp.page ? parseInt(sp.page) : 1,
    }),
    getTaskList({ overdue: true, pageSize: 1 }),
  ])

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Tasks</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">
        {overdueCount > 0 && (
          <span className="text-red-600 font-medium">{overdueCount} overdue · </span>
        )}
        All open tasks
      </p>
      <TaskTable rows={rows as any} total={total} />
    </div>
  )
}
