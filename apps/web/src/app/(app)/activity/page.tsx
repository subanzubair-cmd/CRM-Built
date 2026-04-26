import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getActivityFeed } from '@/lib/activity'
import { formatDistanceToNow } from 'date-fns'

export const metadata = { title: 'Activity' }

function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, '')
  if (raw.startsWith('+1') && digits.length === 11) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return raw
}

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
            const from = typeof detail?.from === 'string' ? detail.from : null
            const to = typeof detail?.to === 'string' ? detail.to : null
            return (
              <div key={log.id} className="px-5 py-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-gray-600">
                    {log.user?.name?.[0] ?? '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{description}</p>
                  {(from || to) && (
                    <p className="text-[11px] font-mono text-gray-500 mt-0.5">
                      {from && (
                        <>
                          <span className="font-sans uppercase tracking-wide text-gray-400 mr-0.5">From</span>
                          {formatPhone(from)}
                        </>
                      )}
                      {from && to && <span className="mx-1.5 text-gray-300">·</span>}
                      {to && (
                        <>
                          <span className="font-sans uppercase tracking-wide text-gray-400 mr-0.5">To</span>
                          {formatPhone(to)}
                        </>
                      )}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {log.user?.name ?? 'System'}
                    {log.property && (
                      <> · {log.property.streetAddress ?? 'Unknown property'}</>
                    )}
                    {' · '}
                    {/* Relative distance is epoch math — timezone-
                        agnostic by definition. The TZ matters only
                        when we render an absolute date format below. */}
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
