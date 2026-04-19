import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getLeadById, getLeadCommStats, getAdjacentLeadIds } from '@/lib/leads'
import { getConversationMessages } from '@/lib/inbox'
import { LeadDetailHeader } from '@/components/leads/LeadDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { AssociatedLeadsCard } from '@/components/leads/AssociatedLeadsCard'
import { TasksCard } from '@/components/leads/TasksCard'
import { PropertyAIPanel } from '@/components/ai/PropertyAIPanel'
import { PropertyChatPanel } from '@/components/ai/PropertyChatPanel'
import { PropertyEditPanel } from '@/components/leads/PropertyEditPanel'
import { AutoFillButton } from '@/components/leads/AutoFillButton'
import { PropertyAppointmentsCard } from '@/components/leads/PropertyAppointmentsCard'
import { DocumentsCard } from '@/components/leads/DocumentsCard'
import { TagsCard } from '@/components/leads/TagsCard'
import { AssociatedPropertiesCard } from '@/components/leads/AssociatedPropertiesCard'
import { QuickActionBar } from '@/components/leads/QuickActionBar'
import { PromoteButton } from '@/components/pipelines/PromoteButton'
import { LeadDetailLayout } from '@/components/leads/LeadDetailLayout'
import { AnalyticsTimeline } from '@/components/leads/AnalyticsTimeline'
import { TeamCard } from '@/components/leads/TeamCard'
import { DealCalculator } from '@/components/leads/DealCalculator'
import { DuplicateWarningLoader } from '@/components/leads/DuplicateWarningLoader'
import { prisma } from '@/lib/prisma'

type PageProps = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const p = await prisma.property.findUnique({
    where: { id },
    select: { streetAddress: true, city: true },
  })
  const addr = [p?.streetAddress, p?.city].filter(Boolean).join(', ')
  return { title: addr || 'Lead' }
}

export default async function LeadDtaDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const [lead, users, messages] = await Promise.all([
    getLeadById(id),
    prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    getConversationMessages(id),
  ])
  if (!lead) notFound()

  const [commStatsMap, adjacentIds] = await Promise.all([
    getLeadCommStats([lead.id]),
    getAdjacentLeadIds(lead.id, 'dta'),
  ])
  const cs = commStatsMap[lead.id] ?? { callCount: 0, smsCount: 0, emailCount: 0, lastCallAt: null, totalTasks: 0, completedTasks: 0 }

  const firstAppt = lead.tasks?.find((t: any) => t.type === 'APPOINTMENT')

  const propertyAddress = [lead.streetAddress, lead.city, [lead.state, lead.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Property'

  const contactOptions = (lead.contacts ?? [])
    .filter((pc: any) => pc.contact?.phone || pc.contact?.email)
    .map((pc: any) => ({
      id: pc.contact.id,
      name: `${pc.contact.firstName} ${pc.contact.lastName ?? ''}`.trim(),
      phone: pc.contact.phone ?? '',
      email: pc.contact.email ?? null,
      type: pc.contact.type ?? 'SELLER',
    }))

  const promoteOptions = [
    ...(lead.activeLeadStage === 'UNDER_CONTRACT' ? [{
      toStatus: 'IN_DISPO',
      label: 'Move to Dispo',
      color: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200',
    }] : []),
    { toStatus: 'DEAD', label: 'Cancel / Dead', color: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200' },
  ]

  const tabs = [
    { key: 'details', label: 'Lead Details' },
    { key: 'dispo', label: 'Dispo' },
    { key: 'tasks', label: 'Tasks & Appts', count: lead.tasks?.filter((t: any) => t.status === 'PENDING')?.length ?? 0 },
    { key: 'files', label: 'Files' },
    { key: 'team', label: 'Team' },
    { key: 'calculator', label: 'Calculator' },
  ]

  const tabContent: Record<string, React.ReactNode> = {
    details: (
      <>
        <AnalyticsTimeline
          propertyId={lead.id}
          propertyAddress={[lead.streetAddress, lead.city].filter(Boolean).join(', ')}
          contactName={lead.contacts?.[0]?.contact ? `${lead.contacts[0].contact.firstName} ${lead.contacts[0].contact.lastName ?? ''}`.trim() : undefined}
          activeLeadStage={lead.activeLeadStage}
          createdAt={lead.createdAt}
          appointmentDate={firstAppt?.dueAt ?? null}
          offerDate={(lead as any).offerDate ?? null}
          offerPrice={lead.offerPrice ? Number(lead.offerPrice) : null}
          contractDate={lead.contractDate ?? null}
          contractPrice={(lead as any).contractPrice ? Number((lead as any).contractPrice) : null}
          expectedProfit={(lead as any).expectedProfit ? Number((lead as any).expectedProfit) : null}
        />
        <ContactsCard propertyId={lead.id} propertyAddress={propertyAddress} contacts={lead.contacts as any} />
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Property Details</h3>
            <AutoFillButton propertyId={lead.id} />
          </div>
          <dl className="space-y-1.5 text-sm">
            {([
              ['Bedrooms', lead.bedrooms],
              ['Bathrooms', lead.bathrooms?.toString()],
              ['Sq Ft', lead.sqft?.toLocaleString()],
              ['Year Built', lead.yearBuilt],
              ['Lot Size', lead.lotSize ? `${lead.lotSize} acres` : null],
              ['Property Type', lead.propertyType],
              ['Asking Price', lead.askingPrice ? `$${Number(lead.askingPrice).toLocaleString()}` : null],
              ['ARV', lead.arv ? `$${Number(lead.arv).toLocaleString()}` : null],
              ['Repair Est.', lead.repairEstimate ? `$${Number(lead.repairEstimate).toLocaleString()}` : null],
            ] as [string, unknown][]).filter(([, v]) => v != null).map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-gray-500">{label}</dt>
                <dd className="text-gray-900 font-medium">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <PropertyEditPanel
          propertyId={lead.id}
          initialValues={{
            exitStrategy: lead.exitStrategy ?? null,
            askingPrice: lead.askingPrice ? Number(lead.askingPrice) : null,
            offerPrice: lead.offerPrice ? Number(lead.offerPrice) : null,
            arv: lead.arv ? Number(lead.arv) : null,
            repairEstimate: lead.repairEstimate ? Number(lead.repairEstimate) : null,
            bedrooms: lead.bedrooms ?? null,
            bathrooms: lead.bathrooms ? Number(lead.bathrooms) : null,
            sqft: lead.sqft ?? null,
            yearBuilt: lead.yearBuilt ?? null,
            lotSize: lead.lotSize ? Number(lead.lotSize) : null,
            propertyType: lead.propertyType ?? null,
            source: lead.source ?? null,
            campaignName: lead.campaignName ?? null,
            leadCampaignId: (lead as any).leadCampaignId ?? null,
            defaultOutboundNumber: (lead as any).defaultOutboundNumber ?? null,
            assignedToId: lead.assignedToId ?? null,
            tags: lead.tags,
          }}
          users={users}
          campaignTypeFilter="DTA"
        />
        <PromoteButton propertyId={lead.id} options={promoteOptions} />
        <TagsCard propertyId={lead.id} initialTags={lead.tags} />
        <AssociatedLeadsCard propertyId={lead.id} />
        <AssociatedPropertiesCard propertyId={lead.id} />
        <details className="group">
          <summary className="bg-white border border-gray-200 rounded-xl px-4 py-3 cursor-pointer flex items-center justify-between text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors">
            AI Summary & Chat
            <svg className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </summary>
          <div className="mt-2 space-y-4">
            <PropertyAIPanel propertyId={lead.id} initialSummary={(lead as any).aiSummary ?? null} initialIsHot={lead.isHot} />
            <PropertyChatPanel propertyId={lead.id} />
          </div>
        </details>
      </>
    ),
    dispo: (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Disposition</h3>
        <p className="text-sm text-gray-500">Buyer matching and offers for this property.</p>
      </div>
    ),
    tasks: (
      <>
        <PropertyAppointmentsCard propertyId={lead.id} />
        <TasksCard propertyId={lead.id} tasks={lead.tasks as any} />
      </>
    ),
    files: <DocumentsCard propertyId={lead.id} />,
    team: <TeamCard propertyId={lead.id} />,
    calculator: <DealCalculator arv={lead.arv ? Number(lead.arv) : null} propertyId={lead.id} />,
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] -mx-5 -mt-5 -mb-5 overflow-hidden">
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-5">
        <DuplicateWarningLoader leadId={lead.id} pipeline="dta" />
        <LeadDetailHeader
          id={lead.id}
          pipeline="dta"
          streetAddress={lead.streetAddress}
          city={lead.city}
          state={lead.state}
          zip={lead.zip}
          activeLeadStage={lead.activeLeadStage}
          leadStatus={lead.leadStatus}
          isHot={lead.isHot}
          isFavorited={lead.isFavorited}
          source={lead.source}
          createdAt={lead.createdAt}
          lastActivityAt={lead.lastActivityAt}
          underContractData={{
            offerPrice: lead.offerPrice != null ? Number(lead.offerPrice) : null,
            offerType: (lead as any).offerType as 'VERBAL' | 'WRITTEN' | null,
            offerDate: (lead as any).offerDate?.toISOString() ?? null,
            expectedProfit: (lead as any).expectedProfit != null ? Number((lead as any).expectedProfit) : null,
            expectedProfitDate: (lead as any).expectedProfitDate?.toISOString() ?? null,
            contractDate: lead.contractDate?.toISOString() ?? null,
            contractPrice: (lead as any).contractPrice != null ? Number((lead as any).contractPrice) : null,
            scheduledClosingDate: (lead as any).scheduledClosingDate?.toISOString() ?? null,
            exitStrategy: lead.exitStrategy ?? null,
            contingencies: (lead as any).contingencies ?? null,
          }}
          campaignName={lead.campaignName ?? null}
          exitStrategy={lead.exitStrategy ?? null}
          contactPhone={lead.contacts?.[0]?.contact?.phone ?? null}
          callCount={cs.callCount}
          smsCount={cs.smsCount}
          emailCount={cs.emailCount}
          contacts={lead.contacts as any}
          leadNumber={lead.leadNumber}
          prevLeadId={adjacentIds.prevId}
          nextLeadId={adjacentIds.nextId}
        />
        <QuickActionBar
          propertyId={lead.id}
          contacts={contactOptions}
          propertyAddress={propertyAddress}
          pipeline="dta"
          prevLeadId={adjacentIds.prevId}
          nextLeadId={adjacentIds.nextId}
        />
      </div>
      <LeadDetailLayout
        tabs={tabs}
        tabContent={tabContent}
        defaultTab="details"
        propertyId={lead.id}
        messages={messages as any}
        notes={lead.notes as any}
        activityLogs={lead.activityLogs as any}
        stageHistory={lead.stageHistory as any}
      />
    </div>
  )
}
