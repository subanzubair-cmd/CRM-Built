import {
  Property,
  PropertyContact,
  Contact,
  User,
  Op,
} from '@crm/database'
import type { WhereOptions } from '@crm/database'

const DECIMAL_FIELDS = [
  'bathrooms',
  'askingPrice',
  'offerPrice',
  'arv',
  'repairEstimate',
  'lotSize',
  'contractPrice',
  'expectedProfit',
  'underContractPrice',
  'estimatedValue',
  'soldPrice',
] as const

function serializeRow<T extends Record<string, any>>(row: T): T {
  const out: any = { ...row }
  for (const f of DECIMAL_FIELDS) {
    if (out[f] != null) out[f] = Number(out[f])
  }
  return out
}

export interface ArchiveFilter {
  search?: string
  assignedToId?: string
  page?: number
  pageSize?: number
  marketScope?: string[] | null
}

const ARCHIVE_INCLUDE = [
  {
    model: PropertyContact,
    as: 'contacts',
    where: { isPrimary: true },
    required: false,
    limit: 1,
    include: [
      {
        model: Contact,
        as: 'contact',
        attributes: ['firstName', 'lastName', 'phone'],
      },
    ],
  },
  {
    model: User,
    as: 'assignedTo',
    attributes: ['id', 'name'],
  },
] as const

function buildSearchOr(search: string) {
  return [
    { normalizedAddress: { [Op.iLike]: `%${search}%` } },
    { streetAddress: { [Op.iLike]: `%${search}%` } },
    { city: { [Op.iLike]: `%${search}%` } },
  ]
}

export async function getSoldList(filter: ArchiveFilter) {
  const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter

  const where: WhereOptions = { propertyStatus: 'SOLD' }
  if (assignedToId) (where as any).assignedToId = assignedToId
  if (marketScope !== null && marketScope !== undefined) {
    ;(where as any).marketId = { [Op.in]: marketScope }
  }
  if (search) {
    ;(where as any)[Op.or] = buildSearchOr(search)
  }

  const [rows, total] = await Promise.all([
    Property.findAll({
      where,
      include: ARCHIVE_INCLUDE as any,
      order: [['soldAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      // Subquery off + distinct on count needed because of include.where.
      subQuery: false,
    }),
    Property.count({ where }),
  ])

  // Run rows through plain conversion + decimal coercion. raw:true would
  // also work but doesn't preserve nested include shapes the same way.
  const plainRows = rows.map((r) => serializeRow(r.get({ plain: true })))
  return { rows: plainRows, total, page, pageSize }
}

export async function getRentalList(filter: ArchiveFilter) {
  const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter

  const where: WhereOptions = { propertyStatus: 'RENTAL' }
  if (assignedToId) (where as any).assignedToId = assignedToId
  if (marketScope !== null && marketScope !== undefined) {
    ;(where as any).marketId = { [Op.in]: marketScope }
  }
  if (search) {
    ;(where as any)[Op.or] = buildSearchOr(search)
  }

  const [rows, total] = await Promise.all([
    Property.findAll({
      where,
      include: ARCHIVE_INCLUDE as any,
      order: [['updatedAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      subQuery: false,
    }),
    Property.count({ where }),
  ])

  const plainRows = rows.map((r) => serializeRow(r.get({ plain: true })))
  return { rows: plainRows, total, page, pageSize }
}
