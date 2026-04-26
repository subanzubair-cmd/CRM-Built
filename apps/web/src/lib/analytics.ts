import {
  Property,
  Task,
  Message,
  Conversation,
  User,
  FinancialGoal,
  Op,
  fn,
  col,
  literal,
  sequelize,
  QueryTypes,
} from '@crm/database'
import type { WhereOptions } from '@crm/database'

function propertyMarketScope(marketIds: string[] | null | undefined): Record<string, unknown> {
  if (marketIds === null || marketIds === undefined) return {}
  if (marketIds.length === 0) return { marketId: '__NO_MARKET__' }
  return { marketId: { [Op.in]: marketIds } }
}

/** EXISTS subquery filter for Property — returns where fragment narrowing by Property.marketId. */
function propertyJoinScope(marketIds: string[] | null | undefined): Record<string, unknown> {
  if (marketIds === null || marketIds === undefined) return {}
  if (marketIds.length === 0) {
    return {
      propertyId: {
        [Op.in]: literal(`(SELECT id FROM "Property" WHERE "marketId" = '__NO_MARKET__')`),
      },
    }
  }
  const escaped = marketIds.map((m) => `'${m.replace(/'/g, "''")}'`).join(',')
  return {
    propertyId: {
      [Op.in]: literal(`(SELECT id FROM "Property" WHERE "marketId" IN (${escaped}))`),
    },
  }
}

async function groupByProperty(
  field: string,
  where: WhereOptions,
  options: { orderByCountDesc?: boolean; limit?: number } = {},
): Promise<Array<Record<string, unknown>>> {
  const order: any[] = options.orderByCountDesc
    ? [[fn('COUNT', col(field)), 'DESC']]
    : []
  const rows = await Property.findAll({
    where,
    attributes: [field, [fn('COUNT', col(field)), 'count']],
    group: [field],
    order,
    limit: options.limit,
    raw: true,
  }) as unknown as Array<Record<string, unknown>>
  return rows.map((r) => ({
    [field]: r[field],
    _count: { [field]: Number(r.count) },
  }))
}

export async function getAnalyticsOverview(userId?: string, marketIds?: string[] | null) {
  const propertyScope = propertyMarketScope(marketIds)
  const messageScope = propertyJoinScope(marketIds)
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
    Property.count({ where: { leadStatus: 'ACTIVE', ...propertyScope } as WhereOptions }),
    Property.count({ where: { createdAt: { [Op.gte]: startOfMonth }, ...propertyScope } as WhereOptions }),
    Property.count({ where: { propertyStatus: 'IN_TM', ...propertyScope } as WhereOptions }),
    Property.count({ where: { propertyStatus: 'SOLD', soldAt: { [Op.gte]: startOfYear }, ...propertyScope } as WhereOptions }),
    Property.findOne({
      where: { propertyStatus: 'SOLD', soldAt: { [Op.gte]: startOfYear }, ...propertyScope } as WhereOptions,
      attributes: [[fn('SUM', col('offerPrice')), 'sumOfferPrice']],
      raw: true,
    }) as unknown as Promise<{ sumOfferPrice: string | null }>,
    groupByProperty('activeLeadStage',
      { leadStatus: 'ACTIVE', activeLeadStage: { [Op.ne]: null }, ...propertyScope } as WhereOptions),
    groupByProperty('exitStrategy',
      { exitStrategy: { [Op.ne]: null }, ...propertyScope } as WhereOptions),
    Promise.all(
      Array.from({ length: 8 }, (_, i) => {
        const weekStart = new Date(now)
        weekStart.setDate(weekStart.getDate() - 7 * (7 - i))
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekEnd.getDate() + 7)
        return Property.count({ where: { createdAt: { [Op.gte]: weekStart, [Op.lt]: weekEnd }, ...propertyScope } as WhereOptions })
      })
    ),
    Property.count({ where: { leadStatus: 'ACTIVE', assignedToId: null, ...propertyScope } as WhereOptions }),
    Property.count({ where: { leadStatus: 'ACTIVE', assignedToId: null, ...propertyScope } as WhereOptions }),
    groupByProperty('source',
      { source: { [Op.ne]: null }, ...propertyScope } as WhereOptions,
      { orderByCountDesc: true, limit: 8 }),
    Message.count({ where: { channel: 'CALL', createdAt: { [Op.gte]: startOfYear }, ...messageScope } as WhereOptions }),
    Message.count({ where: { channel: 'CALL', direction: 'OUTBOUND', createdAt: { [Op.gte]: startOfYear }, ...messageScope } as WhereOptions }),
    Message.count({ where: { channel: 'CALL', direction: 'INBOUND', createdAt: { [Op.gte]: startOfYear }, ...messageScope } as WhereOptions }),
    Promise.all(
      Array.from({ length: 8 }, (_, i) => {
        const weekStart = new Date(now)
        weekStart.setDate(weekStart.getDate() - 7 * (7 - i))
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekEnd.getDate() + 7)
        return Property.count({
          where: { activeLeadStage: 'UNDER_CONTRACT', updatedAt: { [Op.gte]: weekStart, [Op.lt]: weekEnd }, ...propertyScope } as WhereOptions,
        })
      })
    ),
    userId
      ? FinancialGoal.findAll({ where: { userId, year: now.getFullYear() }, raw: true })
      : Promise.resolve([] as any[]),
  ])

  return {
    activeLeads,
    newLeadsThisMonth,
    inTm,
    soldThisYear,
    revenueThisYear: Number((revenueResult as any)?.sumOfferPrice ?? 0),
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

export async function getDashboardStats(marketIds?: string[] | null) {
  const propertyScope = propertyMarketScope(marketIds)
  const taskScope = propertyJoinScope(marketIds)
  const conversationScope = propertyJoinScope(marketIds)
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
    Task.count({
      where: {
        status: 'PENDING',
        dueAt: { [Op.gte]: startOfToday, [Op.lt]: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000) },
        ...taskScope,
      } as WhereOptions,
    }),
    Task.count({
      where: { status: 'PENDING', dueAt: { [Op.lt]: now }, ...taskScope } as WhereOptions,
    }),
    Property.count({
      where: { leadStatus: 'ACTIVE', createdAt: { [Op.gte]: startOfToday }, ...propertyScope } as WhereOptions,
    }),
    Conversation.count({
      where: { isRead: false, ...conversationScope } as WhereOptions,
    }),
    Property.count({
      where: { activeLeadStage: 'UNDER_CONTRACT', ...propertyScope } as WhereOptions,
    }),
    Property.findOne({
      where: { activeLeadStage: 'UNDER_CONTRACT', ...propertyScope } as WhereOptions,
      attributes: [[fn('SUM', col('expectedProfit')), 'sumExpectedProfit']],
      raw: true,
    }) as unknown as Promise<{ sumExpectedProfit: string | null }>,
    Property.count({
      where: { isHot: true, leadStatus: 'ACTIVE', ...propertyScope } as WhereOptions,
    }),
    Property.count({
      where: { leadStatus: 'ACTIVE', assignedToId: null, ...propertyScope } as WhereOptions,
    }),
    Property.count({
      where: { leadStatus: 'ACTIVE', ...propertyScope } as WhereOptions,
    }),
    Property.count({
      where: {
        leadStatus: 'ACTIVE',
        [Op.or]: [
          { lastActivityAt: { [Op.lt]: sevenDaysAgo } },
          { lastActivityAt: null },
        ],
        ...propertyScope,
      } as WhereOptions,
    }),
  ])

  return {
    tasksDueToday,
    overdueTaskCount,
    newLeadsToday,
    openMessagesCount,
    underContractCount,
    pipelineValue: Number((pipelineValue as any)?.sumExpectedProfit ?? 0),
    hotLeadCount,
    unclaimedCount,
    openLeadsTotal,
    staleLeadsCount,
  }
}

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
  const baseSql = `
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
  `
  const groupBy = `
    GROUP BY p."activeLeadStage"
    ORDER BY p."activeLeadStage"
  `

  const rows = marketIds === null || marketIds === undefined
    ? await sequelize.query<{
        stage: string
        no_drip: string
        no_tasks: string
        neither: string
      }>(`${baseSql} ${groupBy}`, { type: QueryTypes.SELECT })
    : await sequelize.query<{
        stage: string
        no_drip: string
        no_tasks: string
        neither: string
      }>(
        `${baseSql} AND p."marketId" = ANY($1::text[]) ${groupBy}`,
        { bind: [marketIds], type: QueryTypes.SELECT },
      )

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

export async function getCeoDashboardKpis(marketIds?: string[] | null) {
  const propertyScope = propertyMarketScope(marketIds)
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  const [closedRevResult, closedDealsCount, pipelineRevResult, pipelineDealsCount] =
    await Promise.all([
      Property.findOne({
        where: { propertyStatus: 'SOLD', soldAt: { [Op.gte]: startOfYear }, ...propertyScope } as WhereOptions,
        attributes: [
          [fn('SUM', col('contractPrice')), 'sumContractPrice'],
          [fn('SUM', col('offerPrice')), 'sumOfferPrice'],
        ],
        raw: true,
      }) as unknown as Promise<{ sumContractPrice: string | null; sumOfferPrice: string | null }>,
      Property.count({
        where: { propertyStatus: 'SOLD', soldAt: { [Op.gte]: startOfYear }, ...propertyScope } as WhereOptions,
      }),
      Property.findOne({
        where: { propertyStatus: 'IN_TM', ...propertyScope } as WhereOptions,
        attributes: [[fn('SUM', col('offerPrice')), 'sumOfferPrice']],
        raw: true,
      }) as unknown as Promise<{ sumOfferPrice: string | null }>,
      Property.count({
        where: { propertyStatus: 'IN_TM', ...propertyScope } as WhereOptions,
      }),
    ])

  const closedRevenueYtd =
    Number(closedRevResult?.sumContractPrice ?? 0) ||
    Number(closedRevResult?.sumOfferPrice ?? 0)
  const closedDealsYtd = closedDealsCount
  const avgRevenuePerDeal = closedDealsYtd > 0 ? Math.round(closedRevenueYtd / closedDealsYtd) : 0
  const pipelineRevenue = Number(pipelineRevResult?.sumOfferPrice ?? 0)
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
  const sources = await groupByProperty(
    'source',
    { source: { [Op.ne]: null }, ...propertyScope } as WhereOptions,
    { orderByCountDesc: true },
  )
  return sources.map((s: any) => ({
    source: s.source ?? 'Unknown',
    count: s._count?.source ?? 0,
  }))
}

export async function getTeamPerformance(marketIds?: string[] | null) {
  const taskScope = propertyJoinScope(marketIds)
  const messageScope = propertyJoinScope(marketIds)
  const propertyScope = propertyMarketScope(marketIds)
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const users = await User.findAll({
    where: { status: 'ACTIVE' },
    attributes: ['id', 'name'],
    raw: true,
  })

  const results = await Promise.all(
    users.map(async (user: any) => {
      const [leadsAssigned, tasksCompleted, callsMade] = await Promise.all([
        Property.count({
          where: { assignedToId: user.id, ...propertyScope } as WhereOptions,
        }),
        Task.count({
          where: {
            assignedToId: user.id,
            status: 'COMPLETED',
            completedAt: { [Op.gte]: startOfMonth },
            ...taskScope,
          } as WhereOptions,
        }),
        Message.count({
          where: {
            sentById: user.id,
            channel: 'CALL',
            createdAt: { [Op.gte]: startOfMonth },
            ...messageScope,
          } as WhereOptions,
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
    Property.count({ where: { activeLeadStage: 'NEW_LEAD', ...propertyScope } as WhereOptions }),
    Property.count({ where: { activeLeadStage: 'DISCOVERY', ...propertyScope } as WhereOptions }),
    Property.count({ where: { activeLeadStage: 'INTERESTED_ADD_TO_FOLLOW_UP', ...propertyScope } as WhereOptions }),
    Property.count({ where: { activeLeadStage: 'APPOINTMENT_MADE', ...propertyScope } as WhereOptions }),
    Property.count({ where: { activeLeadStage: 'DUE_DILIGENCE', ...propertyScope } as WhereOptions }),
    Property.count({ where: { activeLeadStage: 'OFFER_MADE', ...propertyScope } as WhereOptions }),
    Property.count({ where: { activeLeadStage: 'OFFER_FOLLOW_UP', ...propertyScope } as WhereOptions }),
    Property.count({ where: { activeLeadStage: 'UNDER_CONTRACT', ...propertyScope } as WhereOptions }),
    Property.count({ where: { propertyStatus: 'IN_TM', ...propertyScope } as WhereOptions }),
    Property.count({ where: { propertyStatus: 'IN_INVENTORY', ...propertyScope } as WhereOptions }),
    Property.count({ where: { propertyStatus: 'IN_DISPO', ...propertyScope } as WhereOptions }),
    Property.count({ where: { propertyStatus: 'SOLD', ...propertyScope } as WhereOptions }),
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
