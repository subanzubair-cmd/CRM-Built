import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getLeadList, getLeadCommStats } from '@/lib/leads'
import { prisma } from '@/lib/prisma'
import { LeadTable } from '@/components/leads/LeadTable'
import { LeadFilters } from '@/components/leads/LeadFilters'
import { SavedFilterChips } from '@/components/leads/SavedFilterChips'
import { NewLeadButton } from '@/components/leads/NewLeadButton'
import { KanbanBoard } from '@/components/leads/KanbanBoard'
import { ViewToggle } from '@/components/leads/ViewToggle'
import { User } from '@crm/database'

interface PageProps {
  searchParams: Promise<{ search?: string; stage?: string; assignedToId?: string; isHot?: string; page?: string; view?: string; sort?: string; order?: string }>
}

export const metadata = { title: 'DTA Leads' }

export default async function LeadsDtaPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const view = sp.view ?? 'board'
  const [{ rows, total, page, pageSize }, users] = await Promise.all([
    getLeadList({
      pipeline: 'dta',
      search: sp.search,
      stage: sp.stage,
      assignedToId: sp.assignedToId,
      isHot: sp.isHot === '1',
      page: sp.page ? parseInt(sp.page) : 1,
      sort: sp.sort,
      order: sp.order as 'asc' | 'desc' | undefined,
    }),
    User.findAll({
      where: { status: 'ACTIVE' },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
    }),
  ])

  const commStats = await getLeadCommStats(rows.map((r: any) => r.id))

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">Active Leads — DTA</h1>
        <NewLeadButton leadType="DIRECT_TO_AGENT" />
      </div>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Direct to Agent pipeline</p>
      <SavedFilterChips pipeline="dta" />
      <div className="flex items-center justify-between mb-3">
        <Suspense fallback={<div className="h-8" />}>
          <LeadFilters users={users} pipeline="dta" showHotFilter />
        </Suspense>
        <ViewToggle currentView={view} />
      </div>
      {view === 'board' ? (
        <KanbanBoard rows={rows as any} pipeline="dta" commStats={commStats} />
      ) : (
        <LeadTable rows={rows as any} total={total} pipeline="dta" page={page} pageSize={pageSize} users={users} />
      )}
    </div>
  )
}
