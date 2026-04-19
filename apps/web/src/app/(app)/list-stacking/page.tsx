import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getListSources, getOverlapProperties } from '@/lib/list-stacking'
import { ListStackingHeader } from '@/components/list-stacking/ListStackingHeader'
import { ListSourceTable } from '@/components/list-stacking/ListSourceTable'
import { OverlapPanel } from '@/components/list-stacking/OverlapPanel'

export const metadata = { title: 'List Stacking' }

export default async function ListStackingPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const [sources, overlaps] = await Promise.all([
    getListSources(),
    getOverlapProperties(100),
  ])

  return (
    <div>
      <ListStackingHeader />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <ListSourceTable sources={sources as any} />
        </div>
        <div>
          <OverlapPanel properties={overlaps as any} />
        </div>
      </div>
    </div>
  )
}
