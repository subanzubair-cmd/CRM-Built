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

export async function getVendorById(id: string) {
  const vendor = await Vendor.findByPk(id, {
    include: [{ model: Contact, as: 'contact' }],
  })
  if (!vendor) return null
  // Plain object so consumers (server components → client components) can
  // pass it down without serialization issues. The contact-non-null
  // refinement is preserved via the cast — Vendor.contactId is NOT NULL
  // and the FK is enforced, so eager-load always produces a row.
  type ContactPlain = ReturnType<Contact['get']>
  type VendorPlain = ReturnType<Vendor['get']> & { contact: ContactPlain }
  return vendor.get({ plain: true }) as VendorPlain
}
