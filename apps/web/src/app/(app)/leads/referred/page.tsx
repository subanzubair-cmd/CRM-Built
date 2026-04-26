import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getLeadList } from '@/lib/leads'
import { prisma } from '@/lib/prisma'
import { LeadTable } from '@/components/leads/LeadTable'
import { LeadFilters } from '@/components/leads/LeadFilters'
import { User } from '@crm/database'

interface PageProps {
  searchParams: Promise<{ search?: string; assignedToId?: string; page?: string; sort?: string; order?: string; type?: string }>
}

export const metadata = { title: 'Referred Leads' }

export default async function LeadsReferredPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const leadType = sp.type === 'dta' ? 'dta' as const : 'dts' as const
  const typeLabel = leadType === 'dta' ? ' — DTA' : leadType === 'dts' ? ' — DTS' : ''

  const [{ rows, total, page, pageSize }, users] = await Promise.all([
    getLeadList({
      pipeline: 'referred',
      search: sp.search,
      assignedToId: sp.assignedToId,
      leadType,
      page: sp.page ? parseInt(sp.page) : 1,
      sort: sp.sort,
      order: sp.order as 'asc' | 'desc' | undefined,
    }),
    User.findAll({
      where: { status: 'ACTIVE' },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
      raw: true,
    }),
  ])

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Referred to Agent{typeLabel}</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Leads referred to agents</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} pipeline="referred" showStageFilter={false} />
      </Suspense>
      <LeadTable rows={rows as any} total={total} pipeline="referred" page={page} pageSize={pageSize} users={users} />
    </div>
  )
}
