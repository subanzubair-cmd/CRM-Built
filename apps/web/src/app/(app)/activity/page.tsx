import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getActivityFeed } from '@/lib/activity'
import { formatDistanceToNow } from 'date-fns'

export const metadata = { title: 'Activity' }

export default async function ActivityPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const logs = await getActivityFeed({ pageSize: 100 })

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Activity</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-5">Recent actions across all leads</p>

      {logs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
          <p className="text-sm text-gray-400">No activity yet</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
          {logs.map((log) => {
            const detail = log.detail as Record<string, unknown>
            const description = typeof detail?.description === 'string' ? detail.description : log.action
            return (
              <div key={log.id} className="px-5 py-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-gray-600">
                    {log.user?.name?.[0] ?? '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{description}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {log.user?.name ?? 'System'}
                    {log.property && (
                      <> · {log.property.streetAddress ?? 'Unknown property'}</>
                    )}
                    {' · '}
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
