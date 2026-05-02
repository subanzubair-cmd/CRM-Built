import {
  Property,
  PropertyContact,
  Contact,
  User,
  Market,
  LeadCampaign,
  LeadType,
  LeadStatus,
  Op,
  literal,
  fn,
  col,
  sequelize,
  QueryTypes,
} from '@crm/database'
import type { OrderItem, WhereOptions } from '@crm/database'

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
  leadType?: 'dts' | 'dta'
  page?: number
  pageSize?: number
  sort?: string
  order?: 'asc' | 'desc'
  marketScope?: string[] | null
}

const PIPELINE_WHERE: Record<LeadPipeline, WhereOptions> = {
  dts: { leadType: LeadType.DIRECT_TO_SELLER, leadStatus: LeadStatus.ACTIVE, activeLeadStage: { [Op.ne]: null }, propertyStatus: { [Op.notIn]: ['SOLD', 'RENTAL', 'DEAD'] } },
  dta: { leadType: LeadType.DIRECT_TO_AGENT, leadStatus: LeadStatus.ACTIVE, activeLeadStage: { [Op.ne]: null }, propertyStatus: { [Op.notIn]: ['SOLD', 'RENTAL', 'DEAD'] } },
  warm: { leadStatus: LeadStatus.WARM },
  dead: { leadStatus: LeadStatus.DEAD },
  referred: { leadStatus: LeadStatus.REFERRED_TO_AGENT },
}

function buildOrder(sort?: string, order?: 'asc' | 'desc'): OrderItem[] {
  const dir = (order ?? 'desc').toUpperCase() as 'ASC' | 'DESC'
  const nullsLast = dir === 'DESC' ? 'NULLS LAST' : 'NULLS LAST'

  switch (sort) {
    case 'address':
      return [['streetAddress', dir], ['updatedAt', 'DESC']]
    case 'stage':
      return [['activeLeadStage', dir], ['updatedAt', 'DESC']]
    case 'campaign':
      return [['campaignName', dir], ['updatedAt', 'DESC']]
    case 'lastComm':
      return [literal(`"Property"."lastActivityAt" ${dir} ${nullsLast}`), ['updatedAt', 'DESC']]
    case 'source':
      return [['source', dir], ['updatedAt', 'DESC']]
    case 'market':
      return [[{ model: Market, as: 'market' }, 'name', dir], ['updatedAt', 'DESC']]
    case 'arv':
      return [['arv', dir], ['updatedAt', 'DESC']]
    case 'askingPrice':
      return [['askingPrice', dir], ['updatedAt', 'DESC']]
    case 'offers':
      return [
        literal(`(SELECT COUNT(*) FROM "LeadOffer" lo WHERE lo."propertyId" = "Property"."id") ${dir}`),
        ['updatedAt', 'DESC'],
      ]
    case 'assigned':
      return [[{ model: User, as: 'assignedTo' }, 'name', dir], ['updatedAt', 'DESC']]
    case 'tasks':
      return [
        literal(`(SELECT COUNT(*) FROM "Task" t WHERE t."propertyId" = "Property"."id" AND t."status" = 'PENDING') ${dir}`),
        ['updatedAt', 'DESC'],
      ]
    case 'createdAt':
      return [['createdAt', dir], ['updatedAt', 'DESC']]
    case 'updatedAt':
      return [['updatedAt', dir]]
    default:
      return [literal(`"Property"."lastActivityAt" DESC NULLS LAST`), ['updatedAt', 'DESC']]
  }
}

export async function getLeadList(filter: LeadListFilter) {
  const { pipeline, search, stage, assignedToId, marketId, isHot, leadType, page = 1, pageSize = 50, sort, order, marketScope } = filter
  const base = PIPELINE_WHERE[pipeline] as Record<string, unknown>

  const leadTypeFilter: Record<string, unknown> = leadType === 'dts' ? { leadType: LeadType.DIRECT_TO_SELLER }
    : leadType === 'dta' ? { leadType: LeadType.DIRECT_TO_AGENT }
    : {}

  const marketFilter: Record<string, unknown> = (marketScope !== null && marketScope !== undefined)
    ? {
        marketId: marketId && marketScope.includes(marketId)
          ? marketId
          : { [Op.in]: marketScope },
      }
    : marketId
      ? { marketId }
      : {}

  const where: Record<string, unknown> = {
    ...base,
    ...leadTypeFilter,
    ...(stage && { activeLeadStage: stage }),
    ...(assignedToId && { assignedToId }),
    ...marketFilter,
    ...(isHot && { isHot: true }),
  }

  if (search) {
    const escaped = search.replace(/'/g, "''")
    const like = `%${escaped}%`
    where[Op.and as unknown as string] = [
      {
        [Op.or]: [
          { normalizedAddress: { [Op.iLike]: `%${search}%` } },
          { streetAddress: { [Op.iLike]: `%${search}%` } },
          { city: { [Op.iLike]: `%${search}%` } },
          {
            id: {
              [Op.in]: literal(
                `(SELECT pc."propertyId" FROM "PropertyContact" pc JOIN "Contact" c ON c."id" = pc."contactId" WHERE c."firstName" ILIKE '${like}' OR c."lastName" ILIKE '${like}' OR c."phone" ILIKE '${like}')`,
              ),
            },
          },
        ],
      },
    ]
  }

  const [rows, total] = await Promise.all([
    Property.findAll({
      where: where as WhereOptions,
      attributes: {
        include: [
          [literal(`(SELECT COUNT(*) FROM "Task" t WHERE t."propertyId" = "Property"."id" AND t."status" = 'PENDING')`), '_count_tasks'],
          [literal(`(SELECT COUNT(*) FROM "LeadOffer" lo WHERE lo."propertyId" = "Property"."id")`), '_count_offers'],
        ],
      },
      include: [
        {
          model: PropertyContact,
          as: 'contacts',
          where: { isPrimary: true },
          required: false,
          separate: true,
          limit: 1,
          include: [
            { model: Contact, as: 'contact', attributes: ['firstName', 'lastName', 'phone'] },
          ],
        },
        { model: User, as: 'assignedTo', attributes: ['id', 'name'] },
        { model: Market, as: 'market', attributes: ['id', 'name'] },
      ],
      order: buildOrder(sort, order),
      offset: (page - 1) * pageSize,
      limit: pageSize,
      subQuery: false,
    }),
    Property.count({ where: where as WhereOptions }),
  ])

  const plain = rows.map((row) => {
    const obj = row.get({ plain: true }) as Record<string, any>
    obj._count = {
      tasks: Number(obj._count_tasks ?? 0),
      offers: Number(obj._count_offers ?? 0),
    }
    delete obj._count_tasks
    delete obj._count_offers
    return serializeRow(obj)
  })

  return { rows: plain, total, page, pageSize }
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

  const rows = await sequelize.query<{
    id: string
    call_count: string
    sms_count: string
    email_count: string
    last_call_at: Date | null
    total_tasks: string
    completed_tasks: string
  }>(
    `
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
    WHERE p.id = ANY($1)
    GROUP BY p.id
    `,
    {
      // Use bind (typed parameter passing) instead of replacements (string
      // interpolation) so Postgres receives the JS array as a real text[].
      bind: [propertyIds],
      type: QueryTypes.SELECT,
    },
  )

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
  const row = await Property.findByPk(id, {
    include: [
      {
        model: PropertyContact,
        as: 'contacts',
        separate: true,
        order: [['isPrimary', 'DESC']],
        include: [{ model: Contact, as: 'contact' }],
      },
      {
        association: 'notes',
        separate: true,
        order: [['createdAt', 'DESC']],
        limit: 50,
      },
      {
        association: 'tasks',
        separate: true,
        order: [['dueAt', 'ASC']],
        include: [{ model: User, as: 'assignedTo', attributes: ['id', 'name'] }],
      },
      {
        association: 'activityLogs',
        separate: true,
        order: [['createdAt', 'DESC']],
        limit: 100,
        include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
      },
      {
        association: 'stageHistory',
        separate: true,
        order: [['createdAt', 'DESC']],
        limit: 20,
      },
      { model: User, as: 'assignedTo', attributes: ['id', 'name'] },
      { model: Market, as: 'market', attributes: ['id', 'name'] },
    ],
  })

  if (!row) return null
  const plain = row.get({ plain: true }) as Record<string, any>

  if (plain.leadCampaignId && !plain.campaignName) {
    const campaign = await LeadCampaign.findByPk(plain.leadCampaignId, { attributes: ['name'], raw: true }) as { name: string } | null
    if (campaign) plain.campaignName = campaign.name
  }

  return serializeRow(plain)
}

// ─── Adjacent Leads (prev/next within pipeline) ──────────────────────────────

export async function getAdjacentLeadIds(id: string, pipeline: LeadPipeline): Promise<{ prevId: string | null; nextId: string | null }> {
  const base = PIPELINE_WHERE[pipeline] as Record<string, unknown>
  const current = await Property.findByPk(id, { attributes: ['lastActivityAt', 'updatedAt'], raw: true })
  if (!current) return { prevId: null, nextId: null }

  const ts = current.lastActivityAt ?? new Date(0)
  const updated = current.updatedAt

  const [prev, next] = await Promise.all([
    Property.findOne({
      where: {
        ...base,
        [Op.or]: [
          { lastActivityAt: { [Op.gt]: ts } },
          { lastActivityAt: current.lastActivityAt as Date | null, updatedAt: { [Op.gt]: updated } },
          { lastActivityAt: current.lastActivityAt as Date | null, updatedAt: updated, id: { [Op.lt]: id } },
        ],
      } as WhereOptions,
      order: [literal(`"Property"."lastActivityAt" ASC NULLS LAST`), ['updatedAt', 'ASC']],
      attributes: ['id'],
      raw: true,
    }),
    Property.findOne({
      where: {
        ...base,
        [Op.or]: [
          { lastActivityAt: { [Op.lt]: ts } },
          { lastActivityAt: current.lastActivityAt as Date | null, updatedAt: { [Op.lt]: updated } },
          { lastActivityAt: current.lastActivityAt as Date | null, updatedAt: updated, id: { [Op.gt]: id } },
        ],
      } as WhereOptions,
      order: [literal(`"Property"."lastActivityAt" DESC NULLS LAST`), ['updatedAt', 'DESC']],
      attributes: ['id'],
      raw: true,
    }),
  ])

  return { prevId: (prev as any)?.id ?? null, nextId: (next as any)?.id ?? null }
}
