import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { LeadTable } from '@/components/leads/LeadTable'
import { LeadFilters } from '@/components/leads/LeadFilters'
import { User } from '@crm/database'

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
  const where: any = {
    leadType: 'DIRECT_TO_AGENT',
    leadStatus: 'ACTIVE',
    activeLeadStage: 'VETTED_AGENTS',
    ...(sp.search && {
      OR: [
        { streetAddress: { contains: sp.search, mode: 'insensitive' } },
        { city: { contains: sp.search, mode: 'insensitive' } },
        { contacts: { some: { contact: { firstName: { contains: sp.search, mode: 'insensitive' } } } } },
      ],
    }),
    ...(sp.assignedToId && { assignedToId: sp.assignedToId }),
  }

  const [rows, total, users] = await Promise.all([
    prisma.property.findMany({
      where,
      include: {
        contacts: {
          include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
          take: 1,
        },
        assignedTo: { select: { id: true, name: true } },
        market: { select: { id: true, name: true } },
        _count: { select: { tasks: { where: { status: 'PENDING' } }, offers: true } },
      },
      orderBy: { lastActivityAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
    User.findAll({
      where: { status: 'ACTIVE' },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
      raw: true,
    }),
  ])

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Vetted Agents</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">DTA leads with vetted agent contacts</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} pipeline="dta" showStageFilter={false} />
      </Suspense>
      <LeadTable rows={rows.map(serializeRow) as any} total={total} pipeline="dta" page={page} pageSize={pageSize} users={users} />
    </div>
  )
}
