import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getInventoryList } from '@/lib/pipelines'
import { getLeadCommStats } from '@/lib/leads'
import { prisma } from '@/lib/prisma'
import { PipelineTable } from '@/components/pipelines/PipelineTable'
import { InventoryKanbanBoard } from '@/components/pipelines/InventoryKanbanBoard'
import { LeadFilters } from '@/components/leads/LeadFilters'
import { ViewToggle } from '@/components/leads/ViewToggle'

interface PageProps {
  searchParams: Promise<{ search?: string; assignedToId?: string; page?: string; view?: string; sort?: string; order?: string }>
}

export const metadata = { title: 'Inventory' }

export default async function InventoryPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const view = sp.view ?? 'board'
  const isBoardView = view === 'board'

  const [{ rows, total, page, pageSize }, users] = await Promise.all([
    getInventoryList({
      search: sp.search,
      assignedToId: sp.assignedToId,
      page: sp.page ? parseInt(sp.page) : 1,
      pageSize: isBoardView ? 500 : 50,
    }),
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // Fetch communication stats for all properties on this page
  const commStats = await getLeadCommStats(rows.map((r: any) => r.id))

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Properties in rehab or listed for sale</p>
      <div className="flex items-center justify-between mb-3">
        <Suspense fallback={<div className="h-8" />}>
          <LeadFilters users={users} pipeline="inventory" showStageFilter={false} />
        </Suspense>
        <ViewToggle currentView={view} />
      </div>
      {isBoardView ? (
        <InventoryKanbanBoard rows={rows as any} commStats={commStats} />
      ) : (
        <PipelineTable rows={rows as any} total={total} basePath="/inventory" page={page} pageSize={pageSize} />
      )}
    </div>
  )
}
