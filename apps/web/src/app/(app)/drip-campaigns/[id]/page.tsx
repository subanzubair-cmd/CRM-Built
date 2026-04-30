import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getCampaignById } from '@/lib/campaigns'
import { CampaignStepBuilder } from '@/components/campaigns/CampaignStepBuilder'
import { EnrollmentList } from '@/components/campaigns/EnrollmentList'
// Conversational AI toggle is intentionally hidden per the customer
// build of the drip-campaigns module. The DB column is preserved so
// the feature can be brought back without a data migration; just
// re-import + re-render the component below if/when that happens.
// import { CampaignAiToggle } from '@/components/campaigns/CampaignAiToggle'

interface PageProps {
  params: Promise<{ id: string }>
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  PAUSED: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-sky-50 text-sky-700',
  ARCHIVED: 'bg-gray-100 text-gray-400',
}

function moduleLabel(m: string): string {
  switch (m) {
    case 'LEADS':
      return 'Leads'
    case 'BUYERS':
      return 'Buyers'
    case 'VENDORS':
      return 'Vendors'
    case 'SOLD':
      return 'Sold'
    default:
      return m
  }
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const campaign = await getCampaignById(id)
  return { title: campaign?.name || 'Drip Campaign' }
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const campaign = await getCampaignById(id)
  if (!campaign) notFound()

  return (
    <div>
      <Link
        href="/drip-campaigns"
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors mb-2"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Drip Campaigns
      </Link>
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-gray-900">{campaign.name}</h1>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[campaign.status] ?? ''}`}>
              {campaign.status}
            </span>
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-blue-50 text-blue-700">
              {campaign.type}
            </span>
          </div>
          {campaign.description && (
            <p className="text-sm text-gray-500">{campaign.description}</p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">
            {campaign.market ? `Market: ${campaign.market.name}` : 'All Markets'}
            {' · '}
            Created {new Date(campaign.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <CampaignStepBuilder
            campaignId={campaign.id}
            campaignModule={(campaign as any).module ?? 'LEADS'}
            steps={campaign.steps as any}
          />
        </div>
        <div className="space-y-4">
          <EnrollmentList campaignId={campaign.id} enrollments={campaign.enrollments as any} />
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <h3 className="text-[13px] font-semibold text-gray-900">Details</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="font-medium">{campaign.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className="font-medium">{campaign.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Steps</span>
                <span className="font-medium">{campaign.steps.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Enrolled</span>
                <span className="font-medium">{campaign.enrollments.length}</span>
              </div>
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-gray-100 mt-2">
              <span className="text-gray-500 text-sm">Module</span>
              <span className="font-medium text-sm">
                {moduleLabel((campaign as any).module ?? 'LEADS')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
