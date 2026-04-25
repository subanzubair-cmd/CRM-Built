import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDashboardStats } from '@/lib/analytics'
import { getAnalyticsOverview } from '@/lib/analytics'
import { getAbandonedLeadsMatrix } from '@/lib/analytics'
import { getTaskList } from '@/lib/tasks'
import { getMarketScope } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { Market } from '@crm/database'

const STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: 'New Leads',
  DISCOVERY: 'Discovery',
  INTERESTED_ADD_TO_FOLLOW_UP: 'Follow Up',
  DUE_DILIGENCE: 'Due Diligence',
  OFFER_MADE: 'Offer Made',
  OFFER_FOLLOW_UP: 'Offer Follow Up',
  UNDER_CONTRACT: 'Under Contract',
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

async function resolveMarketLabel(marketIds: string[] | null): Promise<string> {
  if (marketIds === null) {
    const total = await Market.count({ where: { isActive: true } })
    if (total === 1) {
      const m = await Market.findOne({ where: { isActive: true }, attributes: ['name'] })
      return m?.name ?? 'All Markets'
    }
    return 'All Markets'
  }
  if (marketIds.length === 0) return '—'
  if (marketIds.length === 1) {
    const m = await Market.findByPk(marketIds[0], { attributes: ['name'] })
    return m?.name ?? '—'
  }
  return `${marketIds.length} Markets`
}

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const userId = (session.user as any).id as string
  const marketIds = getMarketScope(session)

  // Resolve a human-readable market label from the session. Admins (marketIds=null)
  // see "All Markets"; single-market users see the name; multi-market users see
  // a count. Falls back to "—" if no markets are configured.
  const marketLabel = await resolveMarketLabel(marketIds)

  // Batch 1: lighter queries
  const [stats, analytics] = await Promise.all([
    getDashboardStats(marketIds),
    getAnalyticsOverview(userId, marketIds),
  ])
  // Batch 2: heavier queries (sequential to avoid connection pool exhaustion)
  const abandonedMatrix = await getAbandonedLeadsMatrix(marketIds)
  const { rows: dueTodayTasks } = await getTaskList({ dueToday: true, pageSize: 10 })

  const now = new Date()
  const conversionMax = Math.max(...analytics.conversionWeekly, 1)
  const sourceTotal = analytics.sourceBreakdown.reduce(
    (sum: number, b: any) => sum + ((b._count as any).source as number),
    0
  )

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-5">
        {now.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}{' '}
        &middot; {marketLabel}
      </p>

      {/* ── Row 1: Primary KPI Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Link
          href="/tasks"
          className="bg-white border border-gray-200 rounded-xl p-4 border-l-4 border-l-red-500 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Tasks Due Today
          </p>
          <p className="text-[28px] font-bold text-gray-900 leading-tight">
            {stats.tasksDueToday}
          </p>
          <p className="text-xs text-red-500 mt-1">
            {stats.overdueTaskCount} overdue &rarr;
          </p>
        </Link>

        <Link
          href="/leads/dts?sort=createdAt&order=desc"
          className="bg-white border border-gray-200 rounded-xl p-4 border-l-4 border-l-blue-500 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            New Leads Today
          </p>
          <p className="text-[28px] font-bold text-gray-900 leading-tight">
            {stats.newLeadsToday}
          </p>
          <p className="text-xs text-blue-500 mt-1">
            this month: {analytics.newLeadsThisMonth}
          </p>
        </Link>

        <Link
          href="/inbox"
          className="bg-white border border-gray-200 rounded-xl p-4 border-l-4 border-l-amber-500 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Open Messages
          </p>
          <p className="text-[28px] font-bold text-gray-900 leading-tight">
            {stats.openMessagesCount}
          </p>
          <p className="text-xs text-amber-500 mt-1">
            {stats.openMessagesCount} unread &rarr;
          </p>
        </Link>

        <Link
          href="/leads/dts?stage=UNDER_CONTRACT"
          className="bg-white border border-gray-200 rounded-xl p-4 border-l-4 border-l-green-500 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Under Contract
          </p>
          <p className="text-[28px] font-bold text-gray-900 leading-tight">
            {stats.underContractCount}
          </p>
          <p className="text-xs text-green-500 mt-1">
            ${formatK(stats.pipelineValue)} pipeline &rarr;
          </p>
        </Link>
      </div>

      {/* ── Row 2: Secondary KPI Cards ───────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Link
          href="/leads/dts?isHot=1"
          className="bg-white border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Hot Leads 🔥
          </p>
          <p className="text-2xl font-bold text-amber-500">
            {stats.hotLeadCount}
          </p>
        </Link>

        <Link
          href="/leads/dts?assignedToId=unassigned"
          className="bg-white border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Unclaimed Leads
          </p>
          <p
            className={`text-2xl font-bold ${stats.unclaimedCount > 0 ? 'text-red-500' : 'text-gray-900'}`}
          >
            {stats.unclaimedCount}
          </p>
        </Link>

        <Link
          href="/leads/dts"
          className="bg-white border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Open Leads (Total)
          </p>
          <p className="text-2xl font-bold text-gray-900">
            {stats.openLeadsTotal}
          </p>
        </Link>
      </div>

      {/* ── Row 3: Needs Attention ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Link
          href="/leads/dts?sort=lastActivityAt&order=asc"
          className="bg-red-50 border border-red-200 rounded-xl p-4 hover:bg-red-100 transition-colors cursor-pointer"
        >
          <p className="text-sm font-semibold text-red-700">
            No Activity &gt;7 Days
          </p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {stats.staleLeadsCount}
          </p>
          <p className="text-xs text-red-500 mt-1">leads need follow-up &rarr;</p>
        </Link>

        <Link
          href="/tasks"
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors cursor-pointer"
        >
          <p className="text-sm font-semibold text-amber-700">Overdue Tasks</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {stats.overdueTaskCount}
          </p>
          <p className="text-xs text-amber-500 mt-1">tasks past due &rarr;</p>
        </Link>

        <Link
          href="/leads/dts?assignedToId=unassigned"
          className="bg-blue-50 border border-blue-200 rounded-xl p-4 hover:bg-blue-100 transition-colors cursor-pointer"
        >
          <p className="text-sm font-semibold text-blue-700">
            Unassigned Leads
          </p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {stats.unclaimedCount}
          </p>
          <p className="text-xs text-blue-500 mt-1">
            need assignment &rarr;
          </p>
        </Link>
      </div>

      {/* ── Row 4: Charts ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Conversion Trend (8 weeks) */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-900 mb-3">
            Conversion Trend — 8 Weeks
          </p>
          <div className="flex items-end gap-2 h-28">
            {analytics.conversionWeekly.map((count: number, i: number) => {
              const isCurrentWeek = i === analytics.conversionWeekly.length - 1
              const heightPct = Math.max((count / conversionMax) * 100, 4)
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-400">
                    {count > 0 ? count : ''}
                  </span>
                  <div
                    className={`w-full rounded-t ${isCurrentWeek ? 'bg-blue-600' : 'bg-blue-100'}`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
            {analytics.conversionWeekly.map((_: number, i: number) => (
              <span key={i}>
                {i === analytics.conversionWeekly.length - 1
                  ? 'This wk'
                  : `W-${analytics.conversionWeekly.length - 1 - i}`}
              </span>
            ))}
          </div>
        </div>

        {/* Top Lead Sources */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-900 mb-3">
            Top Lead Sources
          </p>
          {analytics.sourceBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              No source data yet
            </p>
          ) : (
            <div className="space-y-3">
              {analytics.sourceBreakdown
                .slice(0, 5)
                .map((s: any) => {
                  const cnt = (s._count as any).source as number
                  const pct =
                    sourceTotal > 0 ? Math.round((cnt / sourceTotal) * 100) : 0
                  return (
                    <div key={s.source}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 truncate max-w-[160px]">
                          {s.source ?? 'Unknown'}
                        </span>
                        <span className="font-medium text-gray-800">
                          {cnt} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 5: Abandoned Leads + Stats ───────────────────────────── */}
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: '3fr 2fr' }}>
        {/* Abandoned Leads Matrix */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-900 mb-3">
            Abandoned Leads
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 pb-2 pr-4">
                    Stage
                  </th>
                  <th className="text-center text-xs font-medium text-gray-500 pb-2 px-2">
                    No Drip
                  </th>
                  <th className="text-center text-xs font-medium text-gray-500 pb-2 px-2">
                    No Tasks
                  </th>
                  <th className="text-center text-xs font-medium text-gray-500 pb-2 pl-2">
                    Neither
                  </th>
                </tr>
              </thead>
              <tbody>
                {abandonedMatrix.map((row) => (
                  <tr
                    key={row.stage}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="py-2 pr-4 text-gray-700 text-xs font-medium">
                      {STAGE_LABELS[row.stage] ?? row.stage}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <Link
                        href={`/leads/dts?stage=${row.stage}&abandoned=noDrip`}
                        className={`inline-block min-w-[28px] text-xs font-medium rounded px-1.5 py-0.5 hover:bg-gray-100 transition-colors ${row.noDrip > 0 ? 'text-red-600' : 'text-gray-400'}`}
                      >
                        {row.noDrip}
                      </Link>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <Link
                        href={`/leads/dts?stage=${row.stage}&abandoned=noTasks`}
                        className={`inline-block min-w-[28px] text-xs font-medium rounded px-1.5 py-0.5 hover:bg-gray-100 transition-colors ${row.noTasks > 0 ? 'text-amber-600' : 'text-gray-400'}`}
                      >
                        {row.noTasks}
                      </Link>
                    </td>
                    <td className="py-2 pl-2 text-center">
                      <Link
                        href={`/leads/dts?stage=${row.stage}&abandoned=neither`}
                        className={`inline-block min-w-[28px] text-xs font-medium rounded px-1.5 py-0.5 hover:bg-gray-100 transition-colors ${row.neither > 0 ? 'text-red-700 font-bold' : 'text-gray-400'}`}
                      >
                        {row.neither}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Call Stats + Goals */}
        <div className="flex flex-col gap-3">
          {/* Call Stats */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-900 mb-3">
              Call Stats (This Year)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-lg font-bold text-blue-600">
                  {analytics.callsThisYear}
                </p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                  Total
                </p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-600">
                  {analytics.callsOutbound}
                </p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                  Outbound
                </p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-amber-600">
                  {analytics.callsInbound}
                </p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                  Inbound
                </p>
              </div>
            </div>
          </div>

          {/* Goals Progress */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex-1">
            <p className="text-sm font-semibold text-gray-900 mb-3">
              Goals Progress
            </p>
            {analytics.goals.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No goals set &mdash; go to Settings.
              </p>
            ) : (
              <div className="space-y-3">
                {analytics.goals.map(
                  (goal: { type: string; target: number }) => {
                    const target = Number(goal.target)
                    if (target === 0) return null
                    const actual =
                      goal.type === 'REVENUE'
                        ? analytics.revenueThisYear
                        : 0
                    const pct =
                      target > 0
                        ? Math.min(Math.round((actual / target) * 100), 100)
                        : 0
                    const goalLabels: Record<string, string> = {
                      REVENUE: 'Revenue',
                      MARKETING_SPEND: 'Marketing Budget',
                      NET_INCOME: 'Net Income',
                    }
                    const barColor =
                      pct >= 100
                        ? 'bg-green-500'
                        : pct >= 50
                          ? 'bg-blue-500'
                          : 'bg-amber-400'
                    return (
                      <div key={goal.type}>
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-xs font-medium text-gray-700">
                            {goalLabels[goal.type] ?? goal.type}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            ${formatK(actual)} / ${formatK(target)}
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  }
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 6: Tasks Due Today ───────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-900">Tasks Due Today</p>
          <Link
            href="/tasks"
            className="text-xs text-blue-600 hover:text-blue-700 transition-colors"
          >
            View all tasks &rarr;
          </Link>
        </div>
        {dueTodayTasks.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            All clear for today!
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {dueTodayTasks.map((task) => {
              const isOverdue =
                task.dueAt && new Date(task.dueAt) < new Date()
              return (
                <Link
                  key={task.id}
                  href={`/tasks`}
                  className={`flex items-center justify-between py-2.5 px-2 rounded hover:bg-gray-50 transition-colors cursor-pointer ${isOverdue ? 'bg-red-50' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium truncate ${isOverdue ? 'text-red-700' : 'text-gray-800'}`}
                    >
                      {task.title}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {task.property?.streetAddress ?? 'No property'}
                    </p>
                  </div>
                  <div className="ml-3 flex-shrink-0">
                    <span
                      className={`text-[11px] font-medium ${isOverdue ? 'text-red-500' : 'text-gray-500'}`}
                    >
                      {task.dueAt
                        ? new Date(task.dueAt).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
