import { prisma } from '@/lib/prisma'
import { LeadType, LeadStatus, Prisma } from '@crm/database'

const DECIMAL_FIELDS = ['bathrooms', 'askingPrice', 'offerPrice', 'arv', 'repairEstimate', 'lotSize', 'expectedProfit', 'contractPrice', 'underContractPrice', 'estimatedValue', 'soldPrice'] as const

function serializeRow<T extends Record<string, any>>(row: T): T {
  const out: any = { ...row }
  for (const f of DECIMAL_FIELDS) {
    if (out[f] != null) out[f] = Number(out[f])
  }
  return out
}

export type LeadPipeline = 'dts' | 'dta' | 'warm' | 'dead' | 'referred'

export interface LeadListFilter {
  pipeline: LeadPipeline
  search?: string
  stage?: string
  assignedToId?: string
  marketId?: string
  isHot?: boolean
  leadType?: 'dts' | 'dta'       // filter warm/dead/referred by lead type
  page?: number
  pageSize?: number
  sort?: string
  order?: 'asc' | 'desc'
  marketScope?: string[] | null   // null = admin (no filter); [] = no access; string[] = filter to these market IDs
}

// Base pipeline filters — warm/dead/referred need leadType appended at query time
const PIPELINE_WHERE: Record<LeadPipeline, Prisma.PropertyWhereInput> = {
  dts: { leadType: LeadType.DIRECT_TO_SELLER, leadStatus: LeadStatus.ACTIVE, activeLeadStage: { not: null }, propertyStatus: { notIn: ['SOLD', 'RENTAL', 'DEAD'] } },
  dta: { leadType: LeadType.DIRECT_TO_AGENT, leadStatus: LeadStatus.ACTIVE, activeLeadStage: { not: null }, propertyStatus: { notIn: ['SOLD', 'RENTAL', 'DEAD'] } },
  warm: { leadStatus: LeadStatus.WARM },
  dead: { leadStatus: LeadStatus.DEAD },
  referred: { leadStatus: LeadStatus.REFERRED_TO_AGENT },
}

// Sort field mapping: URL param → Prisma orderBy
function buildOrderBy(sort?: string, order?: 'asc' | 'desc'): Prisma.PropertyOrderByWithRelationInput[] {
  const dir = order ?? 'desc'
  const SORT_MAP: Record<string, Prisma.PropertyOrderByWithRelationInput> = {
    address:    { streetAddress: dir },
    stage:      { activeLeadStage: dir },
    campaign:   { campaignName: dir },
    lastComm:   { lastActivityAt: { sort: dir, nulls: 'last' } },
    source:     { source: dir },
    market:     { market: { name: dir } },
    arv:        { arv: dir },
    askingPrice:{ askingPrice: dir },
    offers:     { offers: { _count: dir } },
    assigned:   { assignedTo: { name: dir } },
    tasks:      { tasks: { _count: dir } },
    createdAt:  { createdAt: dir },
    updatedAt:  { updatedAt: dir },
  }

  if (sort && SORT_MAP[sort]) {
    return [SORT_MAP[sort], { updatedAt: 'desc' }]
  }
  // Default sort
  return [{ lastActivityAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }]
}

export async function getLeadList(filter: LeadListFilter) {
  const { pipeline, search, stage, assignedToId, marketId, isHot, leadType, page = 1, pageSize = 50, sort, order, marketScope } = filter
  const base = PIPELINE_WHERE[pipeline]

  // For warm/dead/referred, optionally filter by leadType (dts or dta)
  const leadTypeFilter = leadType === 'dts' ? { leadType: LeadType.DIRECT_TO_SELLER }
    : leadType === 'dta' ? { leadType: LeadType.DIRECT_TO_AGENT }
    : {}

  const where: Prisma.PropertyWhereInput = {
    ...base,
    ...leadTypeFilter,
    ...(stage && { activeLeadStage: stage as any }),
    ...(assignedToId && { assignedToId }),
    ...(marketScope !== null && marketScope !== undefined
      ? {
          marketId: marketId && marketScope.includes(marketId)
            ? marketId
            : { in: marketScope },
        }
      : marketId
        ? { marketId }
        : {}),
    ...(isHot && { isHot: true }),
    ...(search && {
      OR: [
        { normalizedAddress: { contains: search, mode: 'insensitive' } },
        { streetAddress: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        {
          contacts: {
            some: {
              contact: {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ],
    }),
  }

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: {
        contacts: {
          where: { isPrimary: true },
          include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
          take: 1,
        },
        assignedTo: { select: { id: true, name: true } },
        market: { select: { id: true, name: true } },
        _count: {
          select: {
            tasks: { where: { status: 'PENDING' } },
            offers: true,
          },
        },
      },
      orderBy: buildOrderBy(sort, order),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
  ])

  return { rows: rows.map(serializeRow), total, page, pageSize }
}

// ─── Communication Stats (batched raw SQL) ──────────────────────────────────

export interface CommStats {
  id: string
  callCount: number
  smsCount: number
  emailCount: number
  lastCallAt: Date | null
  totalTasks: number
  completedTasks: number
}

export async function getLeadCommStats(propertyIds: string[]): Promise<Record<string, CommStats>> {
  if (propertyIds.length === 0) return {}

  const rows = await prisma.$queryRaw<Array<{
    id: string
    call_count: bigint
    sms_count: bigint
    email_count: bigint
    last_call_at: Date | null
    total_tasks: bigint
    completed_tasks: bigint
  }>>`
    SELECT
      p.id,
      COUNT(DISTINCT m.id) FILTER (WHERE m.channel = 'CALL') as call_count,
      COUNT(DISTINCT m.id) FILTER (WHERE m.channel = 'SMS') as sms_count,
      COUNT(DISTINCT m.id) FILTER (WHERE m.channel = 'EMAIL') as email_count,
      MAX(m."createdAt") FILTER (WHERE m.channel = 'CALL') as last_call_at,
      COUNT(DISTINCT t.id) as total_tasks,
      COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'COMPLETED') as completed_tasks
    FROM "Property" p
    LEFT JOIN "Message" m ON m."propertyId" = p.id
    LEFT JOIN "Task" t ON t."propertyId" = p.id
    WHERE p.id = ANY(${propertyIds})
    GROUP BY p.id
  `

  const map: Record<string, CommStats> = {}
  for (const r of rows) {
    map[r.id] = {
      id: r.id,
      callCount: Number(r.call_count),
      smsCount: Number(r.sms_count),
      emailCount: Number(r.email_count),
      lastCallAt: r.last_call_at,
      totalTasks: Number(r.total_tasks),
      completedTasks: Number(r.completed_tasks),
    }
  }
  return map
}

// ─── Lead by ID ──────────────────────────────────────────────────────────────

export async function getLeadById(id: string) {
  return prisma.property.findUnique({
    where: { id },
    include: {
      contacts: {
        include: { contact: true },
        orderBy: { isPrimary: 'desc' },
      },
      notes: { orderBy: { createdAt: 'desc' }, take: 50 },
      tasks: {
        include: { assignedTo: { select: { id: true, name: true } } },
        orderBy: { dueAt: 'asc' },
      },
      activityLogs: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
      stageHistory: { orderBy: { createdAt: 'desc' }, take: 20 },
      assignedTo: { select: { id: true, name: true } },
      market: { select: { id: true, name: true } },
    },
  })
}

// ─── Adjacent Leads (prev/next within pipeline) ──────────────────────────────

export async function getAdjacentLeadIds(id: string, pipeline: LeadPipeline): Promise<{ prevId: string | null; nextId: string | null }> {
  const base = PIPELINE_WHERE[pipeline]
  const current = await prisma.property.findUnique({ where: { id }, select: { lastActivityAt: true, updatedAt: true } })
  if (!current) return { prevId: null, nextId: null }

  const [prev, next] = await Promise.all([
    prisma.property.findFirst({
      where: {
        ...base,
        OR: [
          { lastActivityAt: { gt: current.lastActivityAt ?? new Date(0) } },
          { lastActivityAt: current.lastActivityAt, updatedAt: { gt: current.updatedAt } },
          { lastActivityAt: current.lastActivityAt, updatedAt: current.updatedAt, id: { lt: id } },
        ],
      },
      orderBy: [{ lastActivityAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'asc' }],
      select: { id: true },
    }),
    prisma.property.findFirst({
      where: {
        ...base,
        OR: [
          { lastActivityAt: { lt: current.lastActivityAt ?? new Date(0) } },
          { lastActivityAt: current.lastActivityAt, updatedAt: { lt: current.updatedAt } },
          { lastActivityAt: current.lastActivityAt, updatedAt: current.updatedAt, id: { gt: id } },
        ],
      },
      orderBy: [{ lastActivityAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      select: { id: true },
    }),
  ])

  return { prevId: prev?.id ?? null, nextId: next?.id ?? null }
}
