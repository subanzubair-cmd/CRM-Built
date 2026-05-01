import {
  Property,
  PropertyContact,
  Contact,
  User,
  Market,
  Note,
  Task,
  ActivityLog,
  StageHistory,
  BuyerMatch,
  BuyerOffer,
  Buyer,
  Op,
  literal,
} from '@crm/database'
import type { WhereOptions } from '@crm/database'

const DECIMAL_FIELDS = ['bathrooms', 'askingPrice', 'offerPrice', 'arv', 'repairEstimate', 'lotSize', 'contractPrice', 'expectedProfit', 'underContractPrice', 'estimatedValue', 'dispoOfferAmount', 'soldPrice'] as const

function serializeRow<T extends Record<string, any>>(row: T): T {
  const out: any = { ...row }
  for (const f of DECIMAL_FIELDS) {
    if (out[f] != null) out[f] = Number(out[f])
  }
  return out
}

export interface PipelineFilter {
  search?: string
  assignedToId?: string
  page?: number
  pageSize?: number
  marketScope?: string[] | null
}

function buildSearchExists(search: string): { id: { [k: symbol]: unknown } } {
  const like = search.replace(/'/g, "''")
  return {
    id: {
      [Op.in]: literal(
        `(SELECT pc."propertyId" FROM "PropertyContact" pc JOIN "Contact" c ON c."id" = pc."contactId" WHERE c."firstName" ILIKE '%${like}%' OR c."lastName" ILIKE '%${like}%')`,
      ),
    },
  }
}

function buildWhere(
  baseWhere: Record<string, unknown>,
  search?: string,
  assignedToId?: string,
  marketScope?: string[] | null,
): WhereOptions {
  const where: Record<string, unknown> = { ...baseWhere }
  if (assignedToId) where.assignedToId = assignedToId
  if (marketScope !== null && marketScope !== undefined) {
    where.marketId = { [Op.in]: marketScope }
  }
  if (search) {
    const like = `%${search}%`
    where[Op.or as unknown as string] = [
      { normalizedAddress: { [Op.iLike]: like } },
      { streetAddress: { [Op.iLike]: like } },
      { city: { [Op.iLike]: like } },
      buildSearchExists(search),
    ]
  }
  return where as WhereOptions
}

function listInclude() {
  return [
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
  ]
}

const TASK_COUNT_ATTR: [any, string] = [
  literal(`(SELECT COUNT(*) FROM "Task" t WHERE t."propertyId" = "Property"."id" AND t."status" = 'PENDING')`),
  '_count_tasks',
]

function reshapeListRow(row: any): Record<string, any> {
  const obj = row.get({ plain: true }) as Record<string, any>
  obj._count = { tasks: Number(obj._count_tasks ?? 0) }
  delete obj._count_tasks
  if (obj._count_buyerMatches !== undefined) {
    obj._count.buyerMatches = Number(obj._count_buyerMatches ?? 0)
    delete obj._count_buyerMatches
  }
  return serializeRow(obj)
}

export async function getTmList(filter: PipelineFilter) {
  const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter
  const where = buildWhere({ propertyStatus: 'IN_TM' }, search, assignedToId, marketScope)

  const [rows, total] = await Promise.all([
    Property.findAll({
      where,
      attributes: { include: [TASK_COUNT_ATTR] },
      include: listInclude(),
      order: [['updatedAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      subQuery: false,
    }),
    Property.count({ where }),
  ])
  return { rows: rows.map(reshapeListRow), total, page, pageSize }
}

export async function getInventoryList(filter: PipelineFilter) {
  const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter
  const where = buildWhere({ propertyStatus: 'IN_INVENTORY' }, search, assignedToId, marketScope)

  const [rows, total] = await Promise.all([
    Property.findAll({
      where,
      attributes: { include: [TASK_COUNT_ATTR] },
      include: listInclude(),
      order: [['updatedAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      subQuery: false,
    }),
    Property.count({ where }),
  ])
  return { rows: rows.map(reshapeListRow), total, page, pageSize }
}

export async function getDispoList(filter: PipelineFilter) {
  const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter
  const where = buildWhere({ inDispo: true }, search, assignedToId, marketScope)

  const [rows, total] = await Promise.all([
    Property.findAll({
      where,
      attributes: {
        include: [
          TASK_COUNT_ATTR,
          [
            literal(`(SELECT COUNT(*) FROM "BuyerMatch" bm WHERE bm."propertyId" = "Property"."id")`),
            '_count_buyerMatches',
          ],
        ],
      },
      include: [
        ...listInclude(),
        {
          model: BuyerOffer,
          as: 'offers',
          attributes: ['buyerId'],
          separate: true,
        },
      ],
      order: [['updatedAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      subQuery: false,
    }),
    Property.count({ where }),
  ])

  // Apply distinct(buyerId) on offers in JS to mirror Prisma's distinct: ['buyerId'].
  const reshaped = rows.map((row) => {
    const obj = reshapeListRow(row)
    if (Array.isArray(obj.offers)) {
      const seen = new Set<string>()
      obj.offers = obj.offers.filter((o: any) => {
        if (seen.has(o.buyerId)) return false
        seen.add(o.buyerId)
        return true
      })
    }
    return obj
  })
  return { rows: reshaped, total, page, pageSize }
}

export async function getPropertyById(id: string) {
  const property = await Property.findByPk(id, {
    include: [
      {
        model: PropertyContact,
        as: 'contacts',
        separate: true,
        order: [['isPrimary', 'DESC']],
        include: [{ model: Contact, as: 'contact' }],
      },
      { model: Note, as: 'notes', separate: true, order: [['createdAt', 'DESC']], limit: 50 },
      {
        model: Task,
        as: 'tasks',
        separate: true,
        order: [['dueAt', 'ASC']],
        include: [{ model: User, as: 'assignedTo', attributes: ['id', 'name'] }],
      },
      {
        model: ActivityLog,
        as: 'activityLogs',
        separate: true,
        order: [['createdAt', 'DESC']],
        limit: 100,
        include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
      },
      {
        model: StageHistory,
        as: 'stageHistory',
        separate: true,
        order: [['createdAt', 'DESC']],
        limit: 20,
      },
      { model: User, as: 'assignedTo', attributes: ['id', 'name'] },
      { model: Market, as: 'market', attributes: ['id', 'name'] },
      {
        model: BuyerMatch,
        as: 'buyerMatches',
        separate: true,
        order: [['score', 'DESC']],
        include: [
          {
            model: Buyer,
            as: 'buyer',
            include: [
              { model: Contact, as: 'contact', attributes: ['firstName', 'lastName', 'phone', 'email'] },
            ],
          },
        ],
      },
      {
        model: BuyerOffer,
        as: 'offers',
        separate: true,
        order: [['submittedAt', 'DESC']],
        include: [
          {
            model: Buyer,
            as: 'buyer',
            include: [
              { model: Contact, as: 'contact', attributes: ['firstName', 'lastName'] },
            ],
          },
        ],
      },
    ],
  })
  if (!property) return null
  return serializeRow(property.get({ plain: true }) as Record<string, any>)
}

export async function getDispoPropertyBuyerMatches(propertyId: string) {
  const matches = await BuyerMatch.findAll({
    where: { propertyId },
    include: [
      {
        model: Buyer,
        as: 'buyer',
        include: [
          { model: Contact, as: 'contact', attributes: ['firstName', 'lastName', 'phone', 'email'] },
        ],
      },
    ],
    order: [['score', 'DESC']],
  })
  return matches.map((m) => m.get({ plain: true }) as any)
}

// ── Adjacent property navigation (prev/next within a propertyStatus pool) ────

export async function getAdjacentPropertyIds(
  id: string,
  propertyStatus: string,
): Promise<{ prevId: string | null; nextId: string | null }> {
  const current = await Property.findByPk(id, {
    attributes: ['lastActivityAt', 'updatedAt'],
    raw: true,
  })
  if (!current) return { prevId: null, nextId: null }

  const ts = (current.lastActivityAt as Date | null) ?? new Date(0)
  const updated = current.updatedAt as Date

  const [prev, next] = await Promise.all([
    Property.findOne({
      where: {
        propertyStatus,
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
        propertyStatus,
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
