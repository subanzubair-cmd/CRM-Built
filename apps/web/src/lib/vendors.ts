import { Vendor, Contact, Op } from '@crm/database'
import type { WhereOptions } from '@crm/database'

export interface VendorListFilter {
  search?: string
  category?: string
  activeOnly?: boolean
  page?: number
  pageSize?: number
}

export async function getVendorList(filter: VendorListFilter) {
  const { search, category, activeOnly = true, page = 1, pageSize = 50 } = filter

  // Sequelize doesn't do nested-relation OR-where as cleanly as Prisma's
  // `contact: { OR: [...] }`. Use an `include.where` block — Sequelize
  // applies it as an INNER JOIN filter on the child.
  const vendorWhere: WhereOptions = {}
  if (activeOnly) (vendorWhere as any).isActive = true
  if (category) (vendorWhere as any).category = category

  const contactWhere: WhereOptions | undefined = search
    ? {
        [Op.or]: [
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } },
        ],
      }
    : undefined

  const [rawRows, total] = await Promise.all([
    Vendor.findAll({
      where: vendorWhere,
      include: [
        {
          model: Contact,
          as: 'contact',
          attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
          // `required: !!contactWhere` makes the join INNER when filtering
          // by search terms (matches Prisma's relation-filter semantics).
          required: !!contactWhere,
          where: contactWhere as any,
        },
      ],
      order: [['createdAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      // subQuery:false lets Sequelize correctly count + paginate when a
      // `where` is on an included model.
      subQuery: false,
    }),
    Vendor.count({
      where: vendorWhere,
      include: contactWhere
        ? [
            {
              model: Contact,
              as: 'contact',
              required: true,
              where: contactWhere as any,
              attributes: [],
            },
          ]
        : undefined,
      distinct: !!contactWhere,
    }),
  ])

  // Convert Sequelize instances → plain nested objects so the result can
  // pass from a Server Component to a Client Component without React 19
  // rejecting it ("Objects with toJSON methods are not supported"). We
  // can't use `raw: true` here because it doesn't preserve the typed
  // include nesting we need; `.get({ plain: true })` is the canonical
  // alternative when an include is involved.
  const rows = rawRows.map((v) => v.get({ plain: true }))

  return { rows, total, page, pageSize }
}

export interface VendorWithContact {
  id: string
  contactId: string
  category: string
  isActive: boolean
  markets: string[]
  notes: string | null
  createdAt: Date
  updatedAt: Date
  contact: {
    id: string
    firstName: string
    lastName: string | null
    email: string | null
    phone: string | null
    phone2: string | null
    address: string | null
    city: string | null
    state: string | null
    zip: string | null
    type: string
    notes: string | null
    tags: string[]
    doNotCall: boolean
    doNotText: boolean
    doNotEmail: boolean
    preferredChannel: string | null
    createdAt: Date
    updatedAt: Date
  }
}

export async function getVendorById(id: string): Promise<VendorWithContact | null> {
  const vendor = await Vendor.findByPk(id, {
    include: [{ model: Contact, as: 'contact' }],
  })
  if (!vendor) return null
  // Plain object so consumers (server components → client components) can
  // pass it down without serialization issues. The contact-non-null
  // refinement is preserved via the cast — Vendor.contactId is NOT NULL
  // and the FK is enforced, so eager-load always produces a row.
  return vendor.get({ plain: true }) as unknown as VendorWithContact
}


/**
 * Vendor SMS Campaigns tab data source. Mirrors getBuyerBlasts() but
 * filters BulkSmsBlast rows to module=VENDORS so the buyer + vendor
 * blast lists never bleed into each other.
 */
export async function getVendorBlasts(limit = 50) {
  const { BulkSmsBlast } = await import("@crm/database")
  const rows = await BulkSmsBlast.findAll({
    where: { module: "VENDORS" as any },
    order: [["createdAt", "DESC"]],
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
