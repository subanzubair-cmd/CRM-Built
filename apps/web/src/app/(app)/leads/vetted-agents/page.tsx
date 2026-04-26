import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import {
  Property,
  PropertyContact,
  Contact,
  User,
  Market,
  Op,
  literal,
} from '@crm/database'
import { LeadTable } from '@/components/leads/LeadTable'
import { LeadFilters } from '@/components/leads/LeadFilters'

interface PageProps {
  searchParams: Promise<{ search?: string; assignedToId?: string; page?: string; sort?: string; order?: string }>
}

const DECIMAL_FIELDS = ['bathrooms', 'askingPrice', 'offerPrice', 'arv', 'repairEstimate', 'lotSize', 'expectedProfit', 'contractPrice', 'underContractPrice', 'estimatedValue'] as const

function serializeRow<T extends Record<string, any>>(row: T): T {
  const out: any = { ...row }
  for (const f of DECIMAL_FIELDS) {
    if (out[f] != null) out[f] = Number(out[f])
  }
  return out
}

export const metadata = { title: 'Vetted Agents' }

export default async function VettedAgentsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const page = sp.page ? parseInt(sp.page) : 1
  const pageSize = 50

  // Base property where. The original Prisma query joined Property →
  // PropertyContact → Contact via a relation filter for the search; we
  // translate that to an EXISTS subquery so the property list isn't
  // multiplied by joined contact rows.
  const where: any = {
    leadType: 'DIRECT_TO_AGENT',
    leadStatus: 'ACTIVE',
    activeLeadStage: 'VETTED_AGENTS',
  }
  if (sp.assignedToId) where.assignedToId = sp.assignedToId
  if (sp.search) {
    const s = sp.search.replace(/'/g, "''")
    where[Op.or] = [
      { streetAddress: { [Op.iLike]: `%${sp.search}%` } },
      { city: { [Op.iLike]: `%${sp.search}%` } },
      {
        id: {
          [Op.in]: literal(
            `(SELECT pc."propertyId" FROM "PropertyContact" pc JOIN "Contact" c ON c."id" = pc."contactId" WHERE c."firstName" ILIKE '%${s}%')`,
          ),
        },
      },
    ]
  }

  const [rows, total, users] = await Promise.all([
    Property.findAll({
      where,
      include: [
        {
          model: PropertyContact,
          as: 'contacts',
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
        { model: User, as: 'assignedTo', attributes: ['id', 'name'] },
        { model: Market, as: 'market', attributes: ['id', 'name'] },
      ],
      attributes: {
        include: [
          [
            literal(
              `(SELECT COUNT(*)::int FROM "Task" t WHERE t."propertyId" = "Property"."id" AND t."status" = 'PENDING')`,
            ),
            'pendingTasksCount',
          ],
          [
            literal(
              `(SELECT COUNT(*)::int FROM "BuyerOffer" bo WHERE bo."propertyId" = "Property"."id")`,
            ),
            'offersCount',
          ],
        ],
      },
      order: [['lastActivityAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      subQuery: false,
    }),
    Property.count({ where }),
    User.findAll({
      where: { status: 'ACTIVE' },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
      raw: true,
    }),
  ])

  // Re-shape into the legacy `_count` envelope so LeadTable doesn't change.
  const shaped = rows.map((r) => {
    const json = r.get({ plain: true }) as any
    return {
      ...serializeRow(json),
      _count: {
        tasks: Number(json.pendingTasksCount ?? 0),
        offers: Number(json.offersCount ?? 0),
      },
    }
  })

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Vetted Agents</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">DTA leads with vetted agent contacts</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} pipeline="dta" showStageFilter={false} />
      </Suspense>
      <LeadTable rows={shaped as any} total={total} pipeline="dta" page={page} pageSize={pageSize} users={users} />
    </div>
  )
}
