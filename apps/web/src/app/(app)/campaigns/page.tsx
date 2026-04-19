import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getCampaignList } from '@/lib/campaigns'
import { CampaignTable } from '@/components/campaigns/CampaignTable'
import { CampaignsHeader } from '@/components/campaigns/CampaignsHeader'

interface PageProps {
  searchParams: Promise<{ type?: string; status?: string; search?: string; page?: string }>
}

export const metadata = { title: 'Campaigns' }

export default async function CampaignsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const { rows, total } = await getCampaignList({
    type: (sp.type as 'DRIP' | 'BROADCAST') ?? undefined,
    status: (sp.status as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED') ?? undefined,
    search: sp.search ?? undefined,
    page: sp.page ? parseInt(sp.page) : 1,
  })

  return (
    <div>
      <CampaignsHeader />
      <CampaignTable rows={rows as any} total={total} />
    </div>
  )
}
