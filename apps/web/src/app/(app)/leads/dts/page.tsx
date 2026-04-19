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

interface PageProps {
  searchParams: Promise<{ search?: string; stage?: string; assignedToId?: string; isHot?: string; page?: string; view?: string; sort?: string; order?: string }>
}

export const metadata = { title: 'DTS Leads' }

export default async function LeadsDtsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const view = sp.view ?? 'board'
  const [{ rows, total, page, pageSize }, users] = await Promise.all([
    getLeadList({
      pipeline: 'dts',
      search: sp.search,
      stage: sp.stage,
      assignedToId: sp.assignedToId,
      isHot: sp.isHot === '1',
      page: sp.page ? parseInt(sp.page) : 1,
      sort: sp.sort,
      order: sp.order as 'asc' | 'desc' | undefined,
    }),
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // Fetch communication stats for all leads on this page
  const commStats = await getLeadCommStats(rows.map((r: any) => r.id))

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">Active Leads — DTS</h1>
        <NewLeadButton leadType="DIRECT_TO_SELLER" />
      </div>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Direct to Seller pipeline</p>
      <SavedFilterChips pipeline="dts" />
      <div className="flex items-center justify-between mb-3">
        <Suspense fallback={<div className="h-8" />}>
          <LeadFilters users={users} pipeline="dts" showHotFilter />
        </Suspense>
        <ViewToggle currentView={view} />
      </div>
      {view === 'board' ? (
        <KanbanBoard rows={rows as any} pipeline="dts" commStats={commStats} />
      ) : (
        <LeadTable rows={rows as any} total={total} pipeline="dts" page={page} pageSize={pageSize} users={users} />
      )}
    </div>
  )
}
