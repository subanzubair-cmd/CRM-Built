import {
  Buyer,
  BuyerCriteria,
  BuyerMatch,
  BuyerOffer,
  Contact,
  Campaign,
  CampaignStep,
  CampaignEnrollment,
  Message,
  Property,
  Op,
  literal,
  sequelize,
} from '@crm/database'
import type { WhereOptions } from '@crm/database'

export interface BuyerListFilter {
  search?: string
  activeOnly?: boolean
  page?: number
  pageSize?: number
  marketScope?: string[] | null
}

export async function getBuyerList(filter: BuyerListFilter) {
  const { search, activeOnly, page = 1, pageSize = 50, marketScope } = filter

  const where: Record<string, unknown> = {
    ...(activeOnly && { isActive: true }),
  }

  if (marketScope !== null && marketScope !== undefined) {
    if (marketScope.length === 0) {
      where.id = ''
    } else {
      const escapedArr = marketScope.map((m) => `'${m.replace(/'/g, "''")}'`).join(',')
      where.id = {
        [Op.in]: literal(`(SELECT id FROM "Buyer" WHERE "preferredMarkets" && ARRAY[${escapedArr}]::text[])`),
      }
    }
  }

  const contactInclude: any = {
    model: Contact,
    as: 'contact',
    attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
  }

  if (search) {
    const like = `%${search}%`
    contactInclude.where = {
      [Op.or]: [
        { firstName: { [Op.iLike]: like } },
        { lastName: { [Op.iLike]: like } },
        { email: { [Op.iLike]: like } },
        { phone: { [Op.like]: `%${search}%` } },
      ],
    }
    contactInclude.required = true
  }

  const [rows, total] = await Promise.all([
    Buyer.findAll({
      where: where as WhereOptions,
      attributes: {
        include: [
          [literal(`(SELECT COUNT(*) FROM "BuyerCriteria" bc WHERE bc."buyerId" = "Buyer"."id")`), '_count_criteria'],
          [literal(`(SELECT COUNT(*) FROM "BuyerMatch" bm WHERE bm."buyerId" = "Buyer"."id")`), '_count_matches'],
          [literal(`(SELECT COUNT(*) FROM "BuyerOffer" bo WHERE bo."buyerId" = "Buyer"."id")`), '_count_offers'],
        ],
      },
      include: [
        contactInclude,
        {
          model: BuyerMatch,
          as: 'matches',
          where: { dispoStage: 'SOLD' },
          required: false,
          attributes: ['propertyId', 'dispoOfferAmount'],
          separate: true,
        },
      ],
      order: [['createdAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      subQuery: false,
    }),
    Buyer.count({
      where: where as WhereOptions,
      ...(search ? { include: [{ ...contactInclude, attributes: [] }], distinct: true, col: 'id' } : {}),
    }),
  ])

  const plain = rows.map((row) => {
    const obj = row.get({ plain: true }) as Record<string, any>
    obj._count = {
      criteria: Number(obj._count_criteria ?? 0),
      matches: Number(obj._count_matches ?? 0),
      offers: Number(obj._count_offers ?? 0),
    }
    delete obj._count_criteria
    delete obj._count_matches
    delete obj._count_offers
    return obj
  })

  return { rows: plain, total, page, pageSize }
}

export async function getBuyerDashboardStats() {
  const [
    totalBuyers,
    totalAgents,
    withEmail,
    withPhone,
    activeBuyers,
  ] = await Promise.all([
    Contact.count({ where: { type: 'BUYER' } }),
    Contact.count({ where: { type: 'AGENT' } }),
    Contact.count({
      where: {
        type: { [Op.in]: ['BUYER', 'AGENT'] },
        email: { [Op.ne]: null },
      } as WhereOptions,
    }),
    Contact.count({
      where: {
        type: { [Op.in]: ['BUYER', 'AGENT'] },
        phone: { [Op.ne]: null },
      } as WhereOptions,
    }),
    Buyer.count({ where: { isActive: true } }),
  ])

  const totalContacts = totalBuyers + totalAgents

  const withDeals = await Buyer.count({
    where: {
      id: {
        [Op.in]: literal(`(SELECT DISTINCT "buyerId" FROM "BuyerOffer")`),
      },
    } as WhereOptions,
  })

  return {
    totalContacts,
    totalBuyers,
    totalAgents,
    withEmail,
    withPhone,
    withDeals,
    activeBuyers,
  }
}

export async function getTopBuyers(limit = 5) {
  const buyers = await Buyer.findAll({
    where: {
      id: {
        [Op.in]: literal(`(SELECT DISTINCT "buyerId" FROM "BuyerMatch" WHERE "dispoStage" = 'SOLD')`),
      },
    } as WhereOptions,
    include: [
      { model: Contact, as: 'contact', attributes: ['firstName', 'lastName'] },
      {
        model: BuyerMatch,
        as: 'matches',
        where: { dispoStage: 'SOLD' },
        required: false,
        attributes: ['dispoOfferAmount'],
        separate: true,
      },
    ],
    limit: 50,
  })

  const sorted = buyers
    .map((b) => {
      const plain = b.get({ plain: true }) as any
      return {
        id: plain.id as string,
        name: [plain.contact?.firstName, plain.contact?.lastName].filter(Boolean).join(' '),
        dealsCount: (plain.matches ?? []).length,
        totalOfferAmount: (plain.matches ?? []).reduce(
          (sum: number, m: any) => sum + (m.dispoOfferAmount ? Number(m.dispoOfferAmount) : 0),
          0,
        ),
      }
    })
    .sort((a, b) => b.dealsCount - a.dealsCount)
    .slice(0, limit)

  return sorted
}

export async function getRecentBuyerMessages(limit = 20) {
  const messages = await Message.findAll({
    include: [
      {
        model: Contact,
        as: 'contact',
        where: { type: { [Op.in]: ['BUYER', 'AGENT'] } },
        required: true,
        attributes: ['id', 'firstName', 'lastName'],
        include: [
          { model: Buyer, as: 'buyerProfile', attributes: ['id'] },
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit,
  })

  return messages.map((m) => {
    const plain = m.get({ plain: true }) as any
    return {
      id: plain.id as string,
      buyerName: [plain.contact?.firstName, plain.contact?.lastName].filter(Boolean).join(' '),
      buyerId: plain.contact?.buyerProfile?.id ?? null,
      body: plain.body,
      channel: plain.channel,
      direction: plain.direction,
      createdAt: plain.createdAt,
    }
  })
}

/**
 * Buyer SMS Campaigns tab data source. Reads from `BulkSmsBlast` —
 * NOT from the drip-campaign `Campaign` table, which is a totally
 * separate concept. Returns the most recent 50 blasts targeting
 * the BUYERS module along with denormalised delivery counters so
 * the tab can render without a join-then-group per page load.
 */
export async function getBuyerBlasts(limit = 50) {
  const { BulkSmsBlast } = await import('@crm/database')
  const rows = await BulkSmsBlast.findAll({
    where: { module: 'BUYERS' as any },
    order: [['createdAt', 'DESC']],
    limit,
  })
  return rows.map((r) => {
    const j = r.get({ plain: true }) as any
    return {
      id: j.id as string,
      name: j.name as string,
      body: j.body as string,
      status: j.status as string,
      createdAt: j.createdAt as Date,
      recipientCount: Number(j.recipientCount ?? 0),
      sentCount: Number(j.sentCount ?? 0),
      deliveredCount: Number(j.deliveredCount ?? 0),
      failedCount: Number(j.failedCount ?? 0),
    }
  })
}

/** @deprecated Reads from the drip-campaign Campaign table — kept
 *  as a no-op alias so any stale caller falls through to the new
 *  blast list without breaking. Will be removed once /buyers/page
 *  is fully on getBuyerBlasts. */
export async function getBuyerCampaigns() {
  const campaigns = await Campaign.findAll({
    where: {
      status: { [Op.ne]: 'DRAFT' },
    } as WhereOptions,
    attributes: {
      include: [
        [literal(`(SELECT COUNT(*) FROM "CampaignEnrollment" ce WHERE ce."campaignId" = "Campaign"."id")`), '_count_enrollments'],
      ],
    },
    include: [
      {
        model: CampaignStep,
        as: 'steps',
        where: { channel: 'SMS' },
        required: false,
        attributes: ['id'],
        separate: true,
      },
    ],
    order: [['createdAt', 'DESC']],
    limit: 20,
  })

  return campaigns
    .map((c) => c.get({ plain: true }) as any)
    .filter((c) => (c.steps ?? []).length > 0)
    .map((c) => ({
      id: c.id as string,
      name: c.name as string,
      status: c.status as string,
      type: c.type as string,
      createdAt: c.createdAt as Date,
      recipients: Number(c._count_enrollments ?? 0),
    }))
}

export async function getBuyerById(id: string) {
  const buyer = await Buyer.findByPk(id, {
    include: [
      { model: Contact, as: 'contact' },
      {
        model: BuyerCriteria,
        as: 'criteria',
        separate: true,
        order: [['createdAt', 'DESC']],
      },
      {
        model: BuyerMatch,
        as: 'matches',
        separate: true,
        order: [['score', 'DESC']],
        limit: 50,
        include: [
          {
            model: Property,
            as: 'property',
            attributes: ['id', 'streetAddress', 'city', 'state', 'zip', 'propertyStatus', 'leadType'],
          },
        ],
      },
      {
        model: BuyerOffer,
        as: 'offers',
        separate: true,
        order: [['submittedAt', 'DESC']],
        limit: 50,
        include: [
          {
            model: Property,
            as: 'property',
            attributes: ['id', 'streetAddress', 'city', 'state', 'leadType'],
          },
        ],
      },
    ],
  })
  if (!buyer) return null
  return buyer.get({ plain: true }) as Record<string, any>
}
