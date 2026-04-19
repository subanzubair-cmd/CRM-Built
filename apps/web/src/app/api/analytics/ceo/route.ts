import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getMarketScope } from '@/lib/auth-utils'
import {
  getCeoDashboardKpis,
  getLeadSourceBreakdown,
  getTeamPerformance,
  getConversionFunnel,
} from '@/lib/analytics'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const marketIds = getMarketScope(session)

  const [kpis, leadSources, teamPerformance, conversionFunnel] = await Promise.all([
    getCeoDashboardKpis(marketIds),
    getLeadSourceBreakdown(marketIds),
    getTeamPerformance(marketIds),
    getConversionFunnel(marketIds),
  ])

  return NextResponse.json({
    kpis,
    leadSources,
    teamPerformance,
    conversionFunnel,
  })
}
