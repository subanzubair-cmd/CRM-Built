import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getSoldList } from '@/lib/archive'
import { prisma } from '@/lib/prisma'
import { ArchiveTable } from '@/components/archive/ArchiveTable'
import { LeadFilters } from '@/components/leads/LeadFilters'

interface PageProps {
  searchParams: Promise<{ search?: string; assignedToId?: string; page?: string }>
}

export const metadata = { title: 'Sold' }

export default async function SoldPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const [{ rows, total, page, pageSize }, users] = await Promise.all([
    getSoldList({
      search: sp.search,
      assignedToId: sp.assignedToId,
      page: sp.page ? parseInt(sp.page) : 1,
    }),
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Sold</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Archive of all sold properties</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} pipeline="sold" showStageFilter={false} />
      </Suspense>
      <ArchiveTable rows={rows as any} total={total} type="sold" page={page} pageSize={pageSize} />
    </div>
  )
}
