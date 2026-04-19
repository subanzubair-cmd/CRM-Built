import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import {
  getCeoDashboardKpis,
  getLeadSourceBreakdown,
  getTeamPerformance,
  getConversionFunnel,
} from '@/lib/analytics'

function formatDollars(value: number): string {
  return `$${value.toLocaleString('en-US')}`
}

export const metadata = { title: 'Analytics' }

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const [kpis, leadSources, teamPerformance, conversionFunnel] = await Promise.all([
    getCeoDashboardKpis(),
    getLeadSourceBreakdown(),
    getTeamPerformance(),
    getConversionFunnel(),
  ])

  const totalLeadSources = leadSources.reduce((sum, s) => sum + s.count, 0)
  const maxLeadSource = Math.max(...leadSources.map((s) => s.count), 1)

  const maxFunnelCount = Math.max(...conversionFunnel.map((s) => s.count), 1)

  // Funnel gradient colors blue gradient
  const funnelColors = [
    'bg-blue-500',
    'bg-blue-400',
    'bg-blue-300',
    'bg-cyan-400',
    'bg-cyan-500',
    'bg-blue-400',
    'bg-blue-500',
    'bg-blue-600',
    'bg-indigo-400',
    'bg-indigo-500',
    'bg-indigo-600',
    'bg-violet-500',
  ]

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">CEO Dashboard</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-5">
        {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} — Executive Overview
      </p>

      {/* Row 1: Closed Revenue KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Closed Revenue YTD</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatDollars(kpis.closedRevenueYtd)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Closed Deals YTD</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{kpis.closedDealsYtd}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Revenue / Deal</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatDollars(kpis.avgRevenuePerDeal)}</p>
        </div>
      </div>

      {/* Row 2: Pipeline + Total KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pipeline Revenue</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatDollars(kpis.pipelineRevenue)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Revenue</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatDollars(kpis.totalRevenue)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pipeline Deals</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{kpis.pipelineDeals}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Deals</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{kpis.totalDeals}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Pipeline Rev / Deal</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatDollars(kpis.avgPipelineRevenue)}</p>
        </div>
      </div>

      {/* Row 3: Lead Source Breakdown */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <p className="text-sm font-semibold text-gray-900 mb-4">Lead Source Breakdown</p>
        {leadSources.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No lead source data yet</p>
        ) : (
          <div className="space-y-3">
            {leadSources.map((s) => {
              const pct = totalLeadSources > 0 ? Math.round((s.count / totalLeadSources) * 100) : 0
              const barWidth = Math.max((s.count / maxLeadSource) * 100, 2)
              return (
                <div key={s.source} className="flex items-center gap-4">
                  <span className="text-sm text-gray-600 w-40 flex-shrink-0 truncate">{s.source}</span>
                  <div className="flex-1 h-6 bg-gray-50 border border-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-20 text-right">
                    {s.count} ({pct}%)
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Row 4: Conversion Funnel */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <p className="text-sm font-semibold text-gray-900 mb-4">Conversion Funnel</p>
        <div className="space-y-2">
          {conversionFunnel.map((stage, idx) => {
            const barWidth = maxFunnelCount > 0 ? Math.max((stage.count / maxFunnelCount) * 100, 2) : 2
            const dropoff =
              idx > 0 && conversionFunnel[idx - 1].count > 0
                ? Math.round(
                    ((conversionFunnel[idx - 1].count - stage.count) /
                      conversionFunnel[idx - 1].count) *
                      100
                  )
                : 0
            const colorClass = funnelColors[idx % funnelColors.length]

            return (
              <div key={stage.stage} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-36 flex-shrink-0 truncate">
                  {stage.stage}
                </span>
                <div className="flex-1 h-7 bg-gray-50 border border-gray-100 rounded overflow-hidden">
                  <div
                    className={`h-full ${colorClass} rounded transition-all`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-700 w-12 text-right">
                  {stage.count}
                </span>
                {idx > 0 && dropoff > 0 ? (
                  <span className="text-xs text-red-400 w-14 text-right">-{dropoff}%</span>
                ) : (
                  <span className="w-14" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Row 5: Team Performance */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-900 mb-4">Team Performance</p>
        {teamPerformance.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No team data yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Team Member
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Leads Assigned
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Tasks Completed (Month)
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Calls Made (Month)
                  </th>
                </tr>
              </thead>
              <tbody>
                {teamPerformance.map((member) => (
                  <tr key={member.name} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-gray-900">{member.name}</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">{member.leadsAssigned}</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">{member.tasksCompleted}</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">{member.callsMade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
