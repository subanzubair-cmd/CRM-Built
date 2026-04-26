import { Vendor, Contact, Op, literal } from '@crm/database'
import type { WhereOptions } from '@crm/database'

export interface VendorListFilter {
  search?: string
  category?: string
  activeOnly?: boolean
  page?: number
  pageSize?: number
}

export async function getVendorList(filter: VendorListFilter) {
  const { search, category, activeOnly, page = 1, pageSize = 50 } = filter

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

  const [rows, total] = await Promise.all([
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

  return { rows, total, page, pageSize }
}

export async function getVendorById(id: string) {
  const vendor = await Vendor.findByPk(id, {
    include: [{ model: Contact, as: 'contact' }],
  })
  if (!vendor) return null
  // Sequelize types `contact` as optional even when an include guarantees it.
  // Vendor.contactId is NOT NULL and the FK is enforced, so the eager-load
  // always produces a row; assert the refined type for callers.
  return vendor as Vendor & { contact: Contact }
}
