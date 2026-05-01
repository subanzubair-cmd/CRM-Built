import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getPropertyById, getAdjacentPropertyIds } from '@/lib/pipelines'
import { getConversationMessages } from '@/lib/inbox'
import { getLeadCommStats } from '@/lib/leads'
import { LeadDetailHeader } from '@/components/leads/LeadDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { AssociatedLeadsCard } from '@/components/leads/AssociatedLeadsCard'
import { TasksCard } from '@/components/leads/TasksCard'
import { PropertyEditPanel } from '@/components/leads/PropertyEditPanel'
import { AutoFillButton } from '@/components/leads/AutoFillButton'
import { PropertyAppointmentsCard } from '@/components/leads/PropertyAppointmentsCard'
import { DocumentsCard } from '@/components/leads/DocumentsCard'
import { TagsCard } from '@/components/leads/TagsCard'
import { AssociatedPropertiesCard } from '@/components/leads/AssociatedPropertiesCard'
import { QuickActionBar } from '@/components/leads/QuickActionBar'
import { LeadDetailLayout } from '@/components/leads/LeadDetailLayout'
import { AnalyticsTimeline } from '@/components/leads/AnalyticsTimeline'
import { TeamCard } from '@/components/leads/TeamCard'
import { DealCalculator } from '@/components/leads/DealCalculator'
import { User, Property } from '@crm/database'

type PageProps = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const p = await Property.findByPk(id, { attributes: ['streetAddress', 'city'], raw: true }) as { streetAddress: string | null; city: string | null } | null
  const addr = [p?.streetAddress, p?.city].filter(Boolean).join(', ')
  return { title: addr || 'Sold' }
}

export default async function SoldDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const [property, users, messages] = await Promise.all([
    getPropertyById(id),
    User.findAll({ where: { status: 'ACTIVE' }, attributes: ['id', 'name'], order: [['name', 'ASC']], raw: true }),
    getConversationMessages(id),
  ])
  if (!property) notFound()

  const [commStatsMap, adjacentIds] = await Promise.all([
    getLeadCommStats([property.id]),
    getAdjacentPropertyIds(property.id, 'SOLD'),
  ])
  const cs = commStatsMap[property.id] ?? { callCount: 0, smsCount: 0, emailCount: 0, lastCallAt: null, totalTasks: 0, completedTasks: 0 }

  const firstAppt = property.tasks?.find((t: any) => t.type === 'APPOINTMENT')

  const propertyAddress = [property.streetAddress, property.city, [property.state, property.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Property'

  const contactOptions = (property.contacts ?? [])
    .filter((pc: any) => pc.contact?.phone || pc.contact?.email)
    .map((pc: any) => ({
      id: pc.contact.id,
      name: `${pc.contact.firstName} ${pc.contact.lastName ?? ''}`.trim(),
      phone: pc.contact.phone ?? '',
      email: pc.contact.email ?? null,
      type: pc.contact.type ?? 'SELLER',
    }))

  const tabs = [
    { key: 'details', label: 'Lead Details' },
    { key: 'dispo', label: 'Dispo' },
    { key: 'tasks', label: 'Tasks & Appts', count: property.tasks?.filter((t: any) => t.status === 'PENDING')?.length ?? 0 },
    { key: 'files', label: 'Files' },
    { key: 'team', label: 'Team' },
    { key: 'calculator', label: 'Calculator' },
  ]

  const tabContent: Record<string, React.ReactNode> = {
    details: (
      <>
        <AnalyticsTimeline
          propertyId={property.id}
          propertyAddress={[property.streetAddress, property.city].filter(Boolean).join(', ')}
          activeLeadStage={property.activeLeadStage}
          createdAt={property.createdAt}
          appointmentDate={firstAppt?.dueAt ?? null}
          offerDate={(property as any).offerDate ?? null}
          offerPrice={property.offerPrice ? Number(property.offerPrice) : null}
          contractDate={property.contractDate ?? null}
          contractPrice={(property as any).contractPrice ? Number((property as any).contractPrice) : null}
          expectedProfit={(property as any).expectedProfit ? Number((property as any).expectedProfit) : null}
        />
        <ContactsCard propertyId={property.id} propertyAddress={propertyAddress} contacts={property.contacts as any} />
        {property.soldAt && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-blue-800 mb-2">Sale Information</h3>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-blue-600">Sold Date</dt>
                <dd className="text-blue-900 font-medium">
                  {new Date(property.soldAt).toLocaleDateString()}
                </dd>
              </div>
              {((property as any).soldPrice != null || property.offerPrice != null) && (
                <div className="flex justify-between">
                  <dt className="text-blue-600">Sale Price</dt>
                  <dd className="text-blue-900 font-medium">
                    ${Number((property as any).soldPrice ?? property.offerPrice).toLocaleString()}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Property Details</h3>
            <AutoFillButton propertyId={property.id} />
          </div>
          <dl className="space-y-1.5 text-sm">
            {([
              ['Bedrooms', property.bedrooms],
              ['Bathrooms', property.bathrooms?.toString()],
              ['Sq Ft', property.sqft?.toLocaleString()],
              ['Year Built', property.yearBuilt],
              ['Lot Size', property.lotSize ? `${Number(property.lotSize)} acres` : null],
              ['Property Type', property.propertyType],
              ['Asking Price', property.askingPrice ? `$${Number(property.askingPrice).toLocaleString()}` : null],
              ['ARV', property.arv ? `$${Number(property.arv).toLocaleString()}` : null],
              ['Repair Est.', property.repairEstimate ? `$${Number(property.repairEstimate).toLocaleString()}` : null],
            ] as [string, unknown][]).filter(([, v]) => v != null).map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-gray-500">{label}</dt>
                <dd className="text-gray-900 font-medium">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <PropertyEditPanel
          propertyId={property.id}
          initialValues={{
            exitStrategy: property.exitStrategy ?? null,
            askingPrice: property.askingPrice ? Number(property.askingPrice) : null,
            offerPrice: property.offerPrice ? Number(property.offerPrice) : null,
            arv: property.arv ? Number(property.arv) : null,
            repairEstimate: property.repairEstimate ? Number(property.repairEstimate) : null,
            bedrooms: property.bedrooms ?? null,
            bathrooms: property.bathrooms ? Number(property.bathrooms) : null,
            sqft: property.sqft ?? null,
            yearBuilt: property.yearBuilt ?? null,
            lotSize: property.lotSize ? Number(property.lotSize) : null,
            propertyType: property.propertyType ?? null,
            source: property.source ?? null,
            campaignName: property.campaignName ?? null,
            leadCampaignId: (property as any).leadCampaignId ?? null,
            defaultOutboundNumber: (property as any).defaultOutboundNumber ?? null,
            assignedToId: property.assignedToId ?? null,
            tags: property.tags,
          }}
          users={users}
        />
        <TagsCard propertyId={property.id} initialTags={property.tags} />
        <AssociatedLeadsCard propertyId={property.id} />
        <AssociatedPropertiesCard propertyId={property.id} />
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
        <PropertyAppointmentsCard propertyId={property.id} />
        <TasksCard propertyId={property.id} tasks={property.tasks as any} />
      </>
    ),
    files: <DocumentsCard propertyId={property.id} />,
    team: <TeamCard propertyId={property.id} />,
    calculator: <DealCalculator arv={property.arv ? Number(property.arv) : null} propertyId={property.id} />,
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] -mx-5 -mt-5 -mb-5 overflow-hidden">
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-5">
        <LeadDetailHeader
          id={property.id}
          pipeline={(property as any).leadType === 'DIRECT_TO_AGENT' ? 'dta' : 'dts'}
          viewContext="sold"
          streetAddress={property.streetAddress}
          city={property.city}
          state={property.state}
          zip={property.zip}
          activeLeadStage={property.activeLeadStage}
          leadStatus={property.propertyStatus}
          isHot={property.isHot}
          isFavorited={property.isFavorited}
          source={property.source}
          createdAt={property.createdAt}
          lastActivityAt={property.lastActivityAt}
          underContractData={{
            offerPrice: property.offerPrice != null ? Number(property.offerPrice) : null,
            offerType: (property as any).offerType as 'VERBAL' | 'WRITTEN' | null,
            offerDate: (property as any).offerDate?.toISOString?.() ?? (property as any).offerDate ?? null,
            expectedProfit: (property as any).expectedProfit != null ? Number((property as any).expectedProfit) : null,
            expectedProfitDate: (property as any).expectedProfitDate?.toISOString?.() ?? (property as any).expectedProfitDate ?? null,
            contractDate: property.contractDate?.toISOString?.() ?? (typeof property.contractDate === 'string' ? property.contractDate : null),
            contractPrice: (property as any).contractPrice != null ? Number((property as any).contractPrice) : null,
            scheduledClosingDate: (property as any).scheduledClosingDate?.toISOString?.() ?? (property as any).scheduledClosingDate ?? null,
            exitStrategy: property.exitStrategy ?? null,
            contingencies: (property as any).contingencies ?? null,
          }}
          campaignName={property.campaignName ?? null}
          exitStrategy={property.exitStrategy ?? null}
          contactPhone={property.contacts?.[0]?.contact?.phone ?? null}
          callCount={cs.callCount}
          smsCount={cs.smsCount}
          emailCount={cs.emailCount}
          contacts={property.contacts as any}
          prevLeadId={adjacentIds.prevId}
          nextLeadId={adjacentIds.nextId}
        />
        <QuickActionBar
          propertyId={property.id}
          contacts={contactOptions}
          propertyAddress={propertyAddress}
          pipeline="sold"
          prevLeadId={adjacentIds.prevId}
          nextLeadId={adjacentIds.nextId}
        />
      </div>
      <LeadDetailLayout
        tabs={tabs}
        tabContent={tabContent}
        defaultTab="details"
        propertyId={property.id}
        messages={messages as any}
        notes={property.notes as any}
        activityLogs={property.activityLogs as any}
        stageHistory={property.stageHistory as any}
      />
    </div>
  )
}
