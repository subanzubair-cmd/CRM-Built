import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getCampaignList } from '@/lib/campaigns'
import { DripCampaignsTable } from '@/components/campaigns/DripCampaignsTable'
import { CampaignsHeader } from '@/components/campaigns/CampaignsHeader'

interface PageProps {
  searchParams: Promise<{
    type?: string
    status?: string
    module?: string
    search?: string
    page?: string
  }>
}

export const metadata = { title: 'Drip Campaigns' }

export default async function DripCampaignsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams

  // Tabs default to LEADS — that's the most common module and also
  // the one users land on first when arriving from Settings.
  const activeModule =
    ((sp.module as 'LEADS' | 'BUYERS' | 'VENDORS' | 'SOLD') ?? 'LEADS')

  const { rows, total } = await getCampaignList({
    type: (sp.type as 'DRIP' | 'BROADCAST') ?? 'DRIP',
    status: (sp.status as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED') ?? undefined,
    module: activeModule,
    search: sp.search ?? undefined,
    page: sp.page ? parseInt(sp.page) : 1,
  })

  return (
    <div>
      <CampaignsHeader />
      <DripCampaignsTable rows={rows as any} total={total} activeModule={activeModule} />
    </div>
  )
}
