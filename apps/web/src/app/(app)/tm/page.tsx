import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getTmList } from '@/lib/pipelines'
import { getLeadCommStats } from '@/lib/leads'
import { PipelineTable } from '@/components/pipelines/PipelineTable'
import { LeadFilters } from '@/components/leads/LeadFilters'
import { ViewToggle } from '@/components/leads/ViewToggle'
import { TmKanbanBoard } from '@/components/pipelines/TmKanbanBoard'
import { User } from '@crm/database'

interface PageProps {
  searchParams: Promise<{ search?: string; assignedToId?: string; page?: string; view?: string; sort?: string; order?: string }>
}

export const metadata = { title: 'Transaction Management' }

export default async function TmPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const view = sp.view ?? 'board'
  const [{ rows, total, page, pageSize }, users] = await Promise.all([
    getTmList({
      search: sp.search,
      assignedToId: sp.assignedToId,
      page: sp.page ? parseInt(sp.page) : 1,
    }),
    User.findAll({
      where: { status: 'ACTIVE' },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
      raw: true,
    }),
  ])

  // Fetch communication stats for all properties on this page
  const commStats = await getLeadCommStats(rows.map((r: any) => r.id))

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Transaction Management</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Properties under contract through closing</p>
      <div className="flex items-center justify-between mb-3">
        <Suspense fallback={<div className="h-8" />}>
          <LeadFilters users={users} pipeline="tm" showStageFilter={false} />
        </Suspense>
        <ViewToggle currentView={view} />
      </div>
      {view === 'board' ? (
        <TmKanbanBoard rows={rows as any} commStats={commStats} />
      ) : (
        <PipelineTable rows={rows as any} total={total} basePath="/tm" page={page} pageSize={pageSize} />
      )}
    </div>
  )
}
