import { prisma } from '@/lib/prisma'
import { User } from '@crm/database'

/**
 * Build a property-scoped Prisma where fragment for the user's markets.
 * marketIds = null → admin, no filter
 * marketIds = []   → impossible filter (returns no rows)
 * marketIds = [...] → marketId in that list
 */
function propertyMarketScope(marketIds: string[] | null | undefined): Record<string, unknown> {
  if (marketIds === null || marketIds === undefined) return {}
  if (marketIds.length === 0) return { marketId: '__NO_MARKET__' }
  return { marketId: { in: marketIds } }
}

/** Same as propertyMarketScope but scoped via a related property (for Message/Task). */
function relatedPropertyMarketScope(
  marketIds: string[] | null | undefined,
): Record<string, unknown> {
  if (marketIds === null || marketIds === undefined) return {}
  if (marketIds.length === 0) return { property: { marketId: '__NO_MARKET__' } }
  return { property: { marketId: { in: marketIds } } }
}

export async function getAnalyticsOverview(userId?: string, marketIds?: string[] | null) {
  const propertyScope = propertyMarketScope(marketIds)
  const messageScope = relatedPropertyMarketScope(marketIds)
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  const [
    activeLeads,
    newLeadsThisMonth,
    inTm,
    soldThisYear,
    revenueResult,
    pipelineStages,
    exitBreakdown,
    weeklyVolume,
    unclaimedCount,
    unassignedCount,
    sourceBreakdown,
    callsTotal,
    callsOutbound,
    callsInbound,
    conversionWeekly,
    goals,
  ] = await Promise.all([
    prisma.property.count({ where: { leadStatus: 'ACTIVE', ...propertyScope } }),
    prisma.property.count({ where: { createdAt: { gte: startOfMonth }, ...propertyScope } }),
    prisma.property.count({ where: { propertyStatus: 'IN_TM', ...propertyScope } }),
    prisma.property.count({ where: { propertyStatus: 'SOLD', soldAt: { gte: startOfYear }, ...propertyScope } }),
    prisma.property.aggregate({
      where: { propertyStatus: 'SOLD', soldAt: { gte: startOfYear }, ...propertyScope },
      _sum: { offerPrice: true },
    }),
    prisma.property.groupBy({
      by: ['activeLeadStage'],
      where: { leadStatus: 'ACTIVE', activeLeadStage: { not: null }, ...propertyScope },
      _count: { activeLeadStage: true },
    }),
    prisma.property.groupBy({
      by: ['exitStrategy'],
      where: { exitStrategy: { not: null }, ...propertyScope },
      _count: { exitStrategy: true },
    }),
    Promise.all(
      Array.from({ length: 8 }, (_, i) => {
        const weekStart = new Date(now)
        weekStart.setDate(weekStart.getDate() - 7 * (7 - i))
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekEnd.getDate() + 7)
        return prisma.property.count({ where: { createdAt: { gte: weekStart, lt: weekEnd }, ...propertyScope } })
      })
    ),
    prisma.property.count({ where: { leadStatus: 'ACTIVE', assignedToId: null, ...propertyScope } }),
    prisma.property.count({ where: { leadStatus: 'ACTIVE', assignedToId: null, ...propertyScope } }),
    prisma.property.groupBy({
      by: ['source'],
      where: { source: { not: null }, ...propertyScope },
      _count: { source: true },
      orderBy: { _count: { source: 'desc' } },
      take: 8,
    }),
    prisma.message.count({ where: { channel: 'CALL', createdAt: { gte: startOfYear }, ...messageScope } }),
    prisma.message.count({ where: { channel: 'CALL', direction: 'OUTBOUND', createdAt: { gte: startOfYear }, ...messageScope } }),
    prisma.message.count({ where: { channel: 'CALL', direction: 'INBOUND', createdAt: { gte: startOfYear }, ...messageScope } }),
    Promise.all(
      Array.from({ length: 8 }, (_, i) => {
        const weekStart = new Date(now)
        weekStart.setDate(weekStart.getDate() - 7 * (7 - i))
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekEnd.getDate() + 7)
        return prisma.property.count({
          where: { activeLeadStage: 'UNDER_CONTRACT', updatedAt: { gte: weekStart, lt: weekEnd }, ...propertyScope },
        })
      })
    ),
    userId
      ? (prisma as any).financialGoal.findMany({ where: { userId, year: now.getFullYear() } })
      : Promise.resolve([]),
  ])

  return {
    activeLeads,
    newLeadsThisMonth,
    inTm,
    soldThisYear,
    revenueThisYear: Number(revenueResult._sum.offerPrice ?? 0),
    pipelineStages,
    exitBreakdown,
    weeklyVolume,
    unclaimedCount,
    unassignedCount,
    sourceBreakdown,
    callsThisYear: callsTotal,
    callsOutbound,
    callsInbound,
    conversionWeekly,
    goals: goals as Array<{ type: string; target: number }>,
  }
}

// ─── Dashboard-specific queries ──────────────────────────────────────────────

export async function getDashboardStats(marketIds?: string[] | null) {
  const propertyScope = propertyMarketScope(marketIds)
  const taskScope = relatedPropertyMarketScope(marketIds)
  const conversationScope = relatedPropertyMarketScope(marketIds)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    tasksDueToday,
    overdueTaskCount,
    newLeadsToday,
    openMessagesCount,
    underContractCount,
    pipelineValue,
    hotLeadCount,
    unclaimedCount,
    openLeadsTotal,
    staleLeadsCount,
  ] = await Promise.all([
    prisma.task.count({
      where: {
        status: 'PENDING',
        dueAt: { gte: startOfToday, lt: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000) },
        ...taskScope,
      },
    }),
    prisma.task.count({
      where: { status: 'PENDING', dueAt: { lt: now }, ...taskScope },
    }),
    prisma.property.count({
      where: { leadStatus: 'ACTIVE', createdAt: { gte: startOfToday }, ...propertyScope },
    }),
    prisma.conversation.count({
      where: { isRead: false, ...conversationScope },
    }),
    prisma.property.count({
      where: { activeLeadStage: 'UNDER_CONTRACT', ...propertyScope },
    }),
    prisma.property.aggregate({
      where: { activeLeadStage: 'UNDER_CONTRACT', ...propertyScope },
      _sum: { expectedProfit: true },
    }),
    prisma.property.count({
      where: { isHot: true, leadStatus: 'ACTIVE', ...propertyScope },
    }),
    prisma.property.count({
      where: { leadStatus: 'ACTIVE', assignedToId: null, ...propertyScope },
    }),
    prisma.property.count({
      where: { leadStatus: 'ACTIVE', ...propertyScope },
    }),
    prisma.property.count({
      where: {
        leadStatus: 'ACTIVE',
        OR: [
          { lastActivityAt: { lt: sevenDaysAgo } },
          { lastActivityAt: null },
        ],
        ...propertyScope,
      },
    }),
  ])

  return {
    tasksDueToday,
    overdueTaskCount,
    newLeadsToday,
    openMessagesCount,
    underContractCount,
    pipelineValue: Number(pipelineValue._sum.expectedProfit ?? 0),
    hotLeadCount,
    unclaimedCount,
    openLeadsTotal,
    staleLeadsCount,
  }
}

// ─── Abandoned Leads Matrix ──────────────────────────────────────────────────

export interface AbandonedRow {
  stage: string
  noDrip: number
  noTasks: number
  neither: number
}

const ACTIVE_STAGES = [
  'NEW_LEAD',
  'DISCOVERY',
  'INTERESTED_ADD_TO_FOLLOW_UP',
  'DUE_DILIGENCE',
  'OFFER_MADE',
  'OFFER_FOLLOW_UP',
  'UNDER_CONTRACT',
]

export async function getAbandonedLeadsMatrix(
  marketIds?: string[] | null,
): Promise<AbandonedRow[]> {
  // Market scope is applied via a second parameterized $queryRaw fragment.
  // Using Prisma.sql would be cleaner; for now we inline safely because
  // marketIds only ever contain CUIDs from the session.
  const rows = marketIds === null || marketIds === undefined
    ? await prisma.$queryRaw<Array<{
        stage: string
        no_drip: bigint
        no_tasks: bigint
        neither: bigint
      }>>`
        SELECT
          p."activeLeadStage" as stage,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM "CampaignEnrollment" ce WHERE ce."propertyId" = p.id AND ce."isActive" = true
            )
          ) as no_drip,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM "Task" t WHERE t."propertyId" = p.id AND t.status = 'PENDING'
            )
          ) as no_tasks,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM "CampaignEnrollment" ce WHERE ce."propertyId" = p.id AND ce."isActive" = true
            )
            AND NOT EXISTS (
              SELECT 1 FROM "Task" t WHERE t."propertyId" = p.id AND t.status = 'PENDING'
            )
          ) as neither
        FROM "Property" p
        WHERE p."leadStatus" = 'ACTIVE'
          AND p."activeLeadStage" IS NOT NULL
        GROUP BY p."activeLeadStage"
        ORDER BY p."activeLeadStage"
      `
    : await prisma.$queryRaw<Array<{
        stage: string
        no_drip: bigint
        no_tasks: bigint
        neither: bigint
      }>>`
        SELECT
          p."activeLeadStage" as stage,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM "CampaignEnrollment" ce WHERE ce."propertyId" = p.id AND ce."isActive" = true
            )
          ) as no_drip,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM "Task" t WHERE t."propertyId" = p.id AND t.status = 'PENDING'
            )
          ) as no_tasks,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM "CampaignEnrollment" ce WHERE ce."propertyId" = p.id AND ce."isActive" = true
            )
            AND NOT EXISTS (
              SELECT 1 FROM "Task" t WHERE t."propertyId" = p.id AND t.status = 'PENDING'
            )
          ) as neither
        FROM "Property" p
        WHERE p."leadStatus" = 'ACTIVE'
          AND p."activeLeadStage" IS NOT NULL
          AND p."marketId" = ANY(${marketIds}::text[])
        GROUP BY p."activeLeadStage"
        ORDER BY p."activeLeadStage"
      `

  const stageMap: Record<string, AbandonedRow> = {}
  for (const r of rows) {
    stageMap[r.stage] = {
      stage: r.stage,
      noDrip: Number(r.no_drip),
      noTasks: Number(r.no_tasks),
      neither: Number(r.neither),
    }
  }

  return ACTIVE_STAGES.map((s) => stageMap[s] ?? { stage: s, noDrip: 0, noTasks: 0, neither: 0 })
}

// ─── CEO Dashboard KPIs ─────────────────────────────────────────────────────

export async function getCeoDashboardKpis(marketIds?: string[] | null) {
  const propertyScope = propertyMarketScope(marketIds)
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  const [closedRevResult, closedDealsCount, pipelineRevResult, pipelineDealsCount] =
    await Promise.all([
      prisma.property.aggregate({
        where: { propertyStatus: 'SOLD', soldAt: { gte: startOfYear }, ...propertyScope },
        _sum: { contractPrice: true, offerPrice: true },
      }),
      prisma.property.count({
        where: { propertyStatus: 'SOLD', soldAt: { gte: startOfYear }, ...propertyScope },
      }),
      prisma.property.aggregate({
        where: { propertyStatus: 'IN_TM', ...propertyScope },
        _sum: { offerPrice: true },
      }),
      prisma.property.count({
        where: { propertyStatus: 'IN_TM', ...propertyScope },
      }),
    ])

  // Use contractPrice if available, fallback to offerPrice
  const closedRevenueYtd =
    Number(closedRevResult._sum.contractPrice ?? 0) ||
    Number(closedRevResult._sum.offerPrice ?? 0)
  const closedDealsYtd = closedDealsCount
  const avgRevenuePerDeal = closedDealsYtd > 0 ? Math.round(closedRevenueYtd / closedDealsYtd) : 0
  const pipelineRevenue = Number(pipelineRevResult._sum.offerPrice ?? 0)
  const pipelineDeals = pipelineDealsCount
  const totalRevenue = closedRevenueYtd + pipelineRevenue
  const totalDeals = closedDealsYtd + pipelineDeals
  const avgPipelineRevenue = pipelineDeals > 0 ? Math.round(pipelineRevenue / pipelineDeals) : 0

  return {
    closedRevenueYtd,
    closedDealsYtd,
    avgRevenuePerDeal,
    pipelineRevenue,
    pipelineDeals,
    totalRevenue,
    totalDeals,
    avgPipelineRevenue,
  }
}

export async function getLeadSourceBreakdown(marketIds?: string[] | null) {
  const propertyScope = propertyMarketScope(marketIds)
  const sources = await prisma.property.groupBy({
    by: ['source'],
    where: { source: { not: null }, ...propertyScope },
    _count: { source: true },
    orderBy: { _count: { source: 'desc' } },
  })

  return sources.map((s) => ({
    source: s.source ?? 'Unknown',
    count: s._count.source,
  }))
}

export async function getTeamPerformance(marketIds?: string[] | null) {
  const taskScope = relatedPropertyMarketScope(marketIds)
  const messageScope = relatedPropertyMarketScope(marketIds)
  const propertyScope = propertyMarketScope(marketIds)
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const users = await User.findAll({
    where: { status: 'ACTIVE' },
    attributes: ['id', 'name'],
  })

  const results = await Promise.all(
    users.map(async (user) => {
      const [leadsAssigned, tasksCompleted, callsMade] = await Promise.all([
        prisma.property.count({
          where: { assignedToId: user.id, ...propertyScope },
        }),
        prisma.task.count({
          where: {
            assignedToId: user.id,
            status: 'COMPLETED',
            completedAt: { gte: startOfMonth },
            ...taskScope,
          },
        }),
        prisma.message.count({
          where: {
            sentById: user.id,
            channel: 'CALL',
            createdAt: { gte: startOfMonth },
            ...messageScope,
          },
        }),
      ])

      return {
        name: user.name,
        leadsAssigned,
        tasksCompleted,
        callsMade,
      }
    })
  )

  return results
}

export async function getConversionFunnel(marketIds?: string[] | null) {
  const propertyScope = propertyMarketScope(marketIds)
  const [
    newLeads,
    discovery,
    interested,
    appointmentMade,
    dueDiligence,
    offersMade,
    offerFollowUp,
    underContract,
    inTm,
    inInventory,
    inDispo,
    sold,
  ] = await Promise.all([
    prisma.property.count({ where: { activeLeadStage: 'NEW_LEAD', ...propertyScope } }),
    prisma.property.count({ where: { activeLeadStage: 'DISCOVERY', ...propertyScope } }),
    prisma.property.count({ where: { activeLeadStage: 'INTERESTED_ADD_TO_FOLLOW_UP', ...propertyScope } }),
    prisma.property.count({ where: { activeLeadStage: 'APPOINTMENT_MADE', ...propertyScope } }),
    prisma.property.count({ where: { activeLeadStage: 'DUE_DILIGENCE', ...propertyScope } }),
    prisma.property.count({ where: { activeLeadStage: 'OFFER_MADE', ...propertyScope } }),
    prisma.property.count({ where: { activeLeadStage: 'OFFER_FOLLOW_UP', ...propertyScope } }),
    prisma.property.count({ where: { activeLeadStage: 'UNDER_CONTRACT', ...propertyScope } }),
    prisma.property.count({ where: { propertyStatus: 'IN_TM', ...propertyScope } }),
    prisma.property.count({ where: { propertyStatus: 'IN_INVENTORY', ...propertyScope } }),
    prisma.property.count({ where: { propertyStatus: 'IN_DISPO', ...propertyScope } }),
    prisma.property.count({ where: { propertyStatus: 'SOLD', ...propertyScope } }),
  ])

  return [
    { stage: 'New Leads', count: newLeads },
    { stage: 'Discovery', count: discovery },
    { stage: 'Interested', count: interested },
    { stage: 'Appointment Made', count: appointmentMade },
    { stage: 'Due Diligence', count: dueDiligence },
    { stage: 'Offers Made', count: offersMade },
    { stage: 'Offer Follow Up', count: offerFollowUp },
    { stage: 'Under Contract', count: underContract },
    { stage: 'In TM', count: inTm },
    { stage: 'In Inventory', count: inInventory },
    { stage: 'In Dispo', count: inDispo },
    { stage: 'Sold', count: sold },
  ]
}
