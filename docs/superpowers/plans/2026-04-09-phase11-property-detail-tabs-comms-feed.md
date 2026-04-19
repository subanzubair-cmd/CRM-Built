# Phase 11 — Property Detail Page: 9-Tab UI + Comms Feed

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor all 7 property detail pages to use a sticky horizontal tab bar with URL-driven tab state, adding Communications and Appointments tabs backed by real data.

**Architecture:** Tab state lives in the URL (`?tab=overview`). Server components read `searchParams.tab` via the Next.js 15 Promise-based API. The property header and tab bar are both sticky inside the `<main class="overflow-auto p-5">` scroll container using `sticky top-0 -mx-5 px-5` negative-margin trick. New server components `PropertyCommsCard` and `PropertyAppointmentsCard` fetch data and render existing client sub-components. The existing app sidebar (already built) is the vertical left nav the user refers to; this phase adds horizontal tabs within each detail page content area.

**Tech Stack:** Next.js 15 App Router, React, Tailwind CSS, existing `getConversationMessages` / `getAppointmentList` lib functions, existing `MessageThread`, `LogCommunicationForm`, `AppointmentList`, `AppointmentModal` components.

---

## File Map

| Action | File |
|--------|------|
| Create | `apps/web/src/components/shared/DetailPageTabs.tsx` |
| Create | `apps/web/src/components/shared/DocumentsEmptyState.tsx` |
| Create | `apps/web/src/components/leads/PropertyCommsCard.tsx` |
| Create | `apps/web/src/components/leads/PropertyAppointmentsCard.tsx` |
| Create | `apps/web/src/components/leads/AddAppointmentButton.tsx` |
| Modify | `apps/web/src/app/(app)/leads/dts/[id]/page.tsx` |
| Modify | `apps/web/src/app/(app)/leads/dta/[id]/page.tsx` |
| Modify | `apps/web/src/app/(app)/tm/[id]/page.tsx` |
| Modify | `apps/web/src/app/(app)/inventory/[id]/page.tsx` |
| Modify | `apps/web/src/app/(app)/dispo/[id]/page.tsx` |
| Modify | `apps/web/src/app/(app)/sold/[id]/page.tsx` |
| Modify | `apps/web/src/app/(app)/rental/[id]/page.tsx` |

---

## Task 1: Create `DetailPageTabs` Component

**Files:**
- Create: `apps/web/src/components/shared/DetailPageTabs.tsx`

- [ ] **Step 1: Write the file**

```tsx
'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export interface TabDef {
  key: string
  label: string
}

interface Props {
  tabs: TabDef[]
  activeTab: string
}

function TabsInner({ tabs, activeTab }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function goToTab(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', key)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="flex items-center gap-0 overflow-x-auto scrollbar-none">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => goToTab(t.key)}
          className={cn(
            'flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
            activeTab === t.key
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function DetailPageTabs(props: Props) {
  return (
    <Suspense fallback={<div className="h-10" />}>
      <TabsInner {...props} />
    </Suspense>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors referencing `DetailPageTabs.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/shared/DetailPageTabs.tsx
git commit -m "feat: add DetailPageTabs client component with URL-driven tab switching"
```

---

## Task 2: Create Utility Components (DocumentsEmptyState + PropertyCommsCard + AddAppointmentButton)

**Files:**
- Create: `apps/web/src/components/shared/DocumentsEmptyState.tsx`
- Create: `apps/web/src/components/leads/PropertyCommsCard.tsx`
- Create: `apps/web/src/components/leads/AddAppointmentButton.tsx`

- [ ] **Step 1: Create `DocumentsEmptyState`**

```tsx
// apps/web/src/components/shared/DocumentsEmptyState.tsx
import { FileText } from 'lucide-react'

export function DocumentsEmptyState() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-12 flex flex-col items-center justify-center text-center">
      <FileText className="w-10 h-10 text-gray-200 mb-3" />
      <p className="text-sm font-medium text-gray-500">No documents yet</p>
      <p className="text-xs text-gray-400 mt-1">Document upload coming soon</p>
    </div>
  )
}
```

- [ ] **Step 2: Create `PropertyCommsCard`**

This is an async server component. `getConversationMessages` is in `apps/web/src/lib/inbox.ts` and accepts `(propertyId: string, limit?: number)`. `MessageThread` accepts `{ messages: MessageRow[] }`. `LogCommunicationForm` accepts `{ propertyId: string }`.

```tsx
// apps/web/src/components/leads/PropertyCommsCard.tsx
import { getConversationMessages } from '@/lib/inbox'
import { MessageThread } from '@/components/inbox/MessageThread'
import { LogCommunicationForm } from '@/components/inbox/LogCommunicationForm'

interface Props {
  propertyId: string
}

export async function PropertyCommsCard({ propertyId }: Props) {
  const messages = await getConversationMessages(propertyId)

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Communications</h3>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          <MessageThread messages={messages as any} />
        </div>
      </div>
      <LogCommunicationForm propertyId={propertyId} />
    </div>
  )
}
```

- [ ] **Step 3: Create `AddAppointmentButton`**

`AppointmentModal` props: `{ open: boolean; onClose: () => void; defaultPropertyId?: string }`.

```tsx
// apps/web/src/components/leads/AddAppointmentButton.tsx
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AppointmentModal } from '@/components/calendar/AppointmentModal'

interface Props {
  propertyId: string
}

export function AddAppointmentButton({ propertyId }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add
      </button>
      <AppointmentModal
        open={open}
        onClose={() => setOpen(false)}
        defaultPropertyId={propertyId}
      />
    </>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shared/DocumentsEmptyState.tsx \
        apps/web/src/components/leads/PropertyCommsCard.tsx \
        apps/web/src/components/leads/AddAppointmentButton.tsx
git commit -m "feat: add PropertyCommsCard, AddAppointmentButton, DocumentsEmptyState components"
```

---

## Task 3: Create `PropertyAppointmentsCard`

**Files:**
- Create: `apps/web/src/components/leads/PropertyAppointmentsCard.tsx`

- [ ] **Step 1: Write the file**

`getAppointmentList` returns `{ rows, total, page, pageSize }`. `AppointmentList` accepts `{ rows: AppointmentRow[], total: number }`.

```tsx
// apps/web/src/components/leads/PropertyAppointmentsCard.tsx
import { getAppointmentList } from '@/lib/calendar'
import { AppointmentList } from '@/components/calendar/AppointmentList'
import { AddAppointmentButton } from '@/components/leads/AddAppointmentButton'

interface Props {
  propertyId: string
}

export async function PropertyAppointmentsCard({ propertyId }: Props) {
  const { rows, total } = await getAppointmentList({ propertyId, pageSize: 50 })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">
          Appointments {total > 0 && <span className="text-gray-400 font-normal">({total})</span>}
        </h3>
        <AddAppointmentButton propertyId={propertyId} />
      </div>
      <AppointmentList rows={rows as any} total={total} />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/leads/PropertyAppointmentsCard.tsx
git commit -m "feat: add PropertyAppointmentsCard server component"
```

---

## Task 4: Refactor `leads/dts/[id]/page.tsx`

**Files:**
- Modify: `apps/web/src/app/(app)/leads/dts/[id]/page.tsx`

9 tabs: Overview, Contacts, Communications, Notes, Tasks, Documents, Appointments, Activity, AI.

The sticky header wraps the back link + `LeadDetailHeader` + `DetailPageTabs` inside `sticky top-0 z-20 bg-white border-b border-gray-200 -mx-5 px-5 pt-3 pb-0`. The `-mx-5 px-5` compensates for `<main>`'s `p-5` padding so the sticky bar spans the full viewport width.

- [ ] **Step 1: Replace the entire file**

```tsx
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getLeadById } from '@/lib/leads'
import { LeadDetailHeader } from '@/components/leads/LeadDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { NotesCard } from '@/components/leads/NotesCard'
import { TasksCard } from '@/components/leads/TasksCard'
import { PropertyAIPanel } from '@/components/ai/PropertyAIPanel'
import { PropertyChatPanel } from '@/components/ai/PropertyChatPanel'
import { ActivityCard } from '@/components/leads/ActivityCard'
import { PropertyEditPanel } from '@/components/leads/PropertyEditPanel'
import { PropertyCommsCard } from '@/components/leads/PropertyCommsCard'
import { PropertyAppointmentsCard } from '@/components/leads/PropertyAppointmentsCard'
import { DetailPageTabs, type TabDef } from '@/components/shared/DetailPageTabs'
import { DocumentsEmptyState } from '@/components/shared/DocumentsEmptyState'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'comms', label: 'Communications' },
  { key: 'notes', label: 'Notes' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'documents', label: 'Documents' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'activity', label: 'Activity' },
  { key: 'ai', label: 'AI' },
]

export default async function LeadDtsDetailPage({ params, searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const { tab = 'overview' } = await searchParams
  const [lead, users] = await Promise.all([
    getLeadById(id),
    prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  if (!lead) notFound()

  return (
    <div>
      {/* Sticky header: back link + property header + tab bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 -mx-5 px-5 pt-3 pb-0">
        <Link href="/leads/dts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2">
          <ChevronLeft className="w-4 h-4" />
          Active Leads — DTS
        </Link>
        <LeadDetailHeader
          id={lead.id}
          pipeline="dts"
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
        />
        <DetailPageTabs tabs={TABS} activeTab={tab} />
      </div>

      {/* Tab content */}
      <div className="pt-5">
        {tab === 'overview' && (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Property Details</h3>
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
            </div>
            <div>
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
                  assignedToId: lead.assignedToId ?? null,
                  tags: lead.tags,
                }}
                users={users}
              />
            </div>
          </div>
        )}
        {tab === 'contacts' && (
          <ContactsCard propertyId={lead.id} contacts={lead.contacts as any} />
        )}
        {tab === 'comms' && (
          <PropertyCommsCard propertyId={lead.id} />
        )}
        {tab === 'notes' && (
          <NotesCard propertyId={lead.id} notes={lead.notes as any} />
        )}
        {tab === 'tasks' && (
          <TasksCard propertyId={lead.id} tasks={lead.tasks as any} />
        )}
        {tab === 'documents' && <DocumentsEmptyState />}
        {tab === 'appointments' && (
          <PropertyAppointmentsCard propertyId={lead.id} />
        )}
        {tab === 'activity' && (
          <ActivityCard
            activityLogs={lead.activityLogs as any}
            stageHistory={lead.stageHistory as any}
          />
        )}
        {tab === 'ai' && (
          <div className="space-y-4 max-w-2xl">
            <PropertyAIPanel
              propertyId={lead.id}
              initialSummary={(lead as any).aiSummary ?? null}
              initialIsHot={lead.isHot}
            />
            <PropertyChatPanel propertyId={lead.id} />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors in `leads/dts/[id]/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/leads/dts/\[id\]/page.tsx
git commit -m "feat: refactor DTS detail page to 9-tab sticky layout"
```

---

## Task 5: Refactor `leads/dta/[id]/page.tsx`

**Files:**
- Modify: `apps/web/src/app/(app)/leads/dta/[id]/page.tsx`

Same 9 tabs as DTS. Overview tab shows a slightly different property details card (no Lot Size in original — keep parity with existing DTA which showed fewer fields, but overview should show all available data).

- [ ] **Step 1: Replace the entire file**

```tsx
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getLeadById } from '@/lib/leads'
import { LeadDetailHeader } from '@/components/leads/LeadDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { NotesCard } from '@/components/leads/NotesCard'
import { TasksCard } from '@/components/leads/TasksCard'
import { PropertyAIPanel } from '@/components/ai/PropertyAIPanel'
import { PropertyChatPanel } from '@/components/ai/PropertyChatPanel'
import { ActivityCard } from '@/components/leads/ActivityCard'
import { PropertyEditPanel } from '@/components/leads/PropertyEditPanel'
import { PropertyCommsCard } from '@/components/leads/PropertyCommsCard'
import { PropertyAppointmentsCard } from '@/components/leads/PropertyAppointmentsCard'
import { DetailPageTabs, type TabDef } from '@/components/shared/DetailPageTabs'
import { DocumentsEmptyState } from '@/components/shared/DocumentsEmptyState'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'comms', label: 'Communications' },
  { key: 'notes', label: 'Notes' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'documents', label: 'Documents' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'activity', label: 'Activity' },
  { key: 'ai', label: 'AI' },
]

export default async function LeadDtaDetailPage({ params, searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const { tab = 'overview' } = await searchParams
  const [lead, users] = await Promise.all([
    getLeadById(id),
    prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  if (!lead) notFound()

  return (
    <div>
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 -mx-5 px-5 pt-3 pb-0">
        <Link href="/leads/dta" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2">
          <ChevronLeft className="w-4 h-4" />
          Active Leads — DTA
        </Link>
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
        />
        <DetailPageTabs tabs={TABS} activeTab={tab} />
      </div>

      <div className="pt-5">
        {tab === 'overview' && (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Property Details</h3>
                <dl className="space-y-1.5 text-sm">
                  {([
                    ['Bedrooms', lead.bedrooms],
                    ['Bathrooms', lead.bathrooms?.toString()],
                    ['Sq Ft', lead.sqft?.toLocaleString()],
                    ['Year Built', lead.yearBuilt],
                    ['Asking Price', lead.askingPrice ? `$${Number(lead.askingPrice).toLocaleString()}` : null],
                    ['ARV', lead.arv ? `$${Number(lead.arv).toLocaleString()}` : null],
                  ] as [string, unknown][]).filter(([, v]) => v != null).map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="text-gray-900 font-medium">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <div>
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
                  assignedToId: lead.assignedToId ?? null,
                  tags: lead.tags,
                }}
                users={users}
              />
            </div>
          </div>
        )}
        {tab === 'contacts' && (
          <ContactsCard propertyId={lead.id} contacts={lead.contacts as any} />
        )}
        {tab === 'comms' && (
          <PropertyCommsCard propertyId={lead.id} />
        )}
        {tab === 'notes' && (
          <NotesCard propertyId={lead.id} notes={lead.notes as any} />
        )}
        {tab === 'tasks' && (
          <TasksCard propertyId={lead.id} tasks={lead.tasks as any} />
        )}
        {tab === 'documents' && <DocumentsEmptyState />}
        {tab === 'appointments' && (
          <PropertyAppointmentsCard propertyId={lead.id} />
        )}
        {tab === 'activity' && (
          <ActivityCard
            activityLogs={lead.activityLogs as any}
            stageHistory={lead.stageHistory as any}
          />
        )}
        {tab === 'ai' && (
          <div className="space-y-4 max-w-2xl">
            <PropertyAIPanel
              propertyId={lead.id}
              initialSummary={(lead as any).aiSummary ?? null}
              initialIsHot={lead.isHot}
            />
            <PropertyChatPanel propertyId={lead.id} />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors in `leads/dta/[id]/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/leads/dta/\[id\]/page.tsx
git commit -m "feat: refactor DTA detail page to 9-tab sticky layout"
```

---

## Task 6: Refactor `tm/[id]/page.tsx`

**Files:**
- Modify: `apps/web/src/app/(app)/tm/[id]/page.tsx`

8 tabs (no AI). Overview tab includes PromoteButton + Deal Details card + PropertyEditPanel.

- [ ] **Step 1: Replace the entire file**

```tsx
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getPropertyById } from '@/lib/pipelines'
import { PipelineDetailHeader } from '@/components/pipelines/PipelineDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { NotesCard } from '@/components/leads/NotesCard'
import { TasksCard } from '@/components/leads/TasksCard'
import { PromoteButton } from '@/components/pipelines/PromoteButton'
import { PropertyEditPanel } from '@/components/leads/PropertyEditPanel'
import { ActivityCard } from '@/components/leads/ActivityCard'
import { PropertyCommsCard } from '@/components/leads/PropertyCommsCard'
import { PropertyAppointmentsCard } from '@/components/leads/PropertyAppointmentsCard'
import { DetailPageTabs, type TabDef } from '@/components/shared/DetailPageTabs'
import { DocumentsEmptyState } from '@/components/shared/DocumentsEmptyState'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'comms', label: 'Communications' },
  { key: 'notes', label: 'Notes' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'documents', label: 'Documents' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'activity', label: 'Activity' },
]

export default async function TmDetailPage({ params, searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const { tab = 'overview' } = await searchParams
  const [property, users] = await Promise.all([
    getPropertyById(id),
    prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  if (!property) notFound()

  const promoteOptions = [
    { toStatus: 'IN_INVENTORY', label: 'Move to Inventory', color: 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200' },
    { toStatus: 'IN_DISPO', label: 'Move to Dispo', color: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200' },
    { toStatus: 'SOLD', label: 'Mark as Sold', color: 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200' },
    { toStatus: 'DEAD', label: 'Cancel / Dead', color: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200' },
  ]

  return (
    <div>
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 -mx-5 px-5 pt-3 pb-0">
        <Link href="/tm" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2">
          <ChevronLeft className="w-4 h-4" />
          Transaction Management
        </Link>
        <PipelineDetailHeader
          id={property.id}
          pipeline="tm"
          streetAddress={property.streetAddress}
          city={property.city}
          state={property.state}
          zip={property.zip}
          propertyStatus={property.propertyStatus}
          tmStage={property.tmStage}
          inventoryStage={property.inventoryStage}
          isHot={property.isHot}
          isFavorited={property.isFavorited}
          contractDate={property.contractDate}
          source={property.source}
          createdAt={property.createdAt}
        />
        <DetailPageTabs tabs={TABS} activeTab={tab} />
      </div>

      <div className="pt-5">
        {tab === 'overview' && (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Deal Details</h3>
                <dl className="space-y-1.5 text-sm">
                  {([
                    ['Exit Strategy', property.exitStrategy?.replace(/_/g, ' ')],
                    ['Offer Price', property.offerPrice ? `$${Number(property.offerPrice).toLocaleString()}` : null],
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
            </div>
            <div className="space-y-4">
              <PromoteButton propertyId={property.id} options={promoteOptions} />
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
                  assignedToId: property.assignedToId ?? null,
                  tags: property.tags,
                }}
                users={users}
              />
            </div>
          </div>
        )}
        {tab === 'contacts' && (
          <ContactsCard propertyId={property.id} contacts={property.contacts as any} />
        )}
        {tab === 'comms' && (
          <PropertyCommsCard propertyId={property.id} />
        )}
        {tab === 'notes' && (
          <NotesCard propertyId={property.id} notes={property.notes as any} />
        )}
        {tab === 'tasks' && (
          <TasksCard propertyId={property.id} tasks={property.tasks as any} />
        )}
        {tab === 'documents' && <DocumentsEmptyState />}
        {tab === 'appointments' && (
          <PropertyAppointmentsCard propertyId={property.id} />
        )}
        {tab === 'activity' && (
          <ActivityCard
            activityLogs={property.activityLogs as any}
            stageHistory={property.stageHistory as any}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/tm/\[id\]/page.tsx
git commit -m "feat: refactor TM detail page to 8-tab sticky layout"
```

---

## Task 7: Refactor `inventory/[id]/page.tsx`

**Files:**
- Modify: `apps/web/src/app/(app)/inventory/[id]/page.tsx`

8 tabs. Overview: Rehab Details card + PromoteButton + PropertyEditPanel.

- [ ] **Step 1: Replace the entire file**

```tsx
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getPropertyById } from '@/lib/pipelines'
import { PipelineDetailHeader } from '@/components/pipelines/PipelineDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { NotesCard } from '@/components/leads/NotesCard'
import { TasksCard } from '@/components/leads/TasksCard'
import { PromoteButton } from '@/components/pipelines/PromoteButton'
import { PropertyEditPanel } from '@/components/leads/PropertyEditPanel'
import { ActivityCard } from '@/components/leads/ActivityCard'
import { PropertyCommsCard } from '@/components/leads/PropertyCommsCard'
import { PropertyAppointmentsCard } from '@/components/leads/PropertyAppointmentsCard'
import { DetailPageTabs, type TabDef } from '@/components/shared/DetailPageTabs'
import { DocumentsEmptyState } from '@/components/shared/DocumentsEmptyState'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'comms', label: 'Communications' },
  { key: 'notes', label: 'Notes' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'documents', label: 'Documents' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'activity', label: 'Activity' },
]

export default async function InventoryDetailPage({ params, searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const { tab = 'overview' } = await searchParams
  const [property, users] = await Promise.all([
    getPropertyById(id),
    prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  if (!property) notFound()

  const promoteOptions = [
    { toStatus: 'IN_DISPO', label: 'Move to Dispo', color: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200' },
    { toStatus: 'SOLD', label: 'Mark as Sold', color: 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200' },
    { toStatus: 'RENTAL', label: 'Convert to Rental', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200' },
    { toStatus: 'DEAD', label: 'Remove / Dead', color: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200' },
  ]

  return (
    <div>
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 -mx-5 px-5 pt-3 pb-0">
        <Link href="/inventory" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2">
          <ChevronLeft className="w-4 h-4" />
          Inventory
        </Link>
        <PipelineDetailHeader
          id={property.id}
          pipeline="inventory"
          streetAddress={property.streetAddress}
          city={property.city}
          state={property.state}
          zip={property.zip}
          propertyStatus={property.propertyStatus}
          tmStage={property.tmStage}
          inventoryStage={property.inventoryStage}
          isHot={property.isHot}
          isFavorited={property.isFavorited}
          contractDate={property.contractDate}
          source={property.source}
          createdAt={property.createdAt}
        />
        <DetailPageTabs tabs={TABS} activeTab={tab} />
      </div>

      <div className="pt-5">
        {tab === 'overview' && (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Rehab Details</h3>
                <dl className="space-y-1.5 text-sm">
                  {([
                    ['Bedrooms', property.bedrooms],
                    ['Bathrooms', property.bathrooms?.toString()],
                    ['Sq Ft', property.sqft?.toLocaleString()],
                    ['Year Built', property.yearBuilt],
                    ['ARV', property.arv ? `$${Number(property.arv).toLocaleString()}` : null],
                    ['Repair Est.', property.repairEstimate ? `$${Number(property.repairEstimate).toLocaleString()}` : null],
                    ['Asking Price', property.askingPrice ? `$${Number(property.askingPrice).toLocaleString()}` : null],
                    ['Exit Strategy', property.exitStrategy?.replace(/_/g, ' ')],
                  ] as [string, unknown][]).filter(([, v]) => v != null).map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="text-gray-900 font-medium">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <div className="space-y-4">
              <PromoteButton propertyId={property.id} options={promoteOptions} />
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
                  assignedToId: property.assignedToId ?? null,
                  tags: property.tags,
                }}
                users={users}
              />
            </div>
          </div>
        )}
        {tab === 'contacts' && (
          <ContactsCard propertyId={property.id} contacts={property.contacts as any} />
        )}
        {tab === 'comms' && (
          <PropertyCommsCard propertyId={property.id} />
        )}
        {tab === 'notes' && (
          <NotesCard propertyId={property.id} notes={property.notes as any} />
        )}
        {tab === 'tasks' && (
          <TasksCard propertyId={property.id} tasks={property.tasks as any} />
        )}
        {tab === 'documents' && <DocumentsEmptyState />}
        {tab === 'appointments' && (
          <PropertyAppointmentsCard propertyId={property.id} />
        )}
        {tab === 'activity' && (
          <ActivityCard
            activityLogs={property.activityLogs as any}
            stageHistory={property.stageHistory as any}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/inventory/\[id\]/page.tsx
git commit -m "feat: refactor Inventory detail page to 8-tab sticky layout"
```

---

## Task 8: Refactor `dispo/[id]/page.tsx`

**Files:**
- Modify: `apps/web/src/app/(app)/dispo/[id]/page.tsx`

8 tabs. Overview tab is unique: it includes `BuyerMatchCard` in the left col-span-2 area, plus PromoteButton + PropertyEditPanel in the right column.

- [ ] **Step 1: Replace the entire file**

```tsx
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getPropertyById } from '@/lib/pipelines'
import { PipelineDetailHeader } from '@/components/pipelines/PipelineDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { NotesCard } from '@/components/leads/NotesCard'
import { TasksCard } from '@/components/leads/TasksCard'
import { PromoteButton } from '@/components/pipelines/PromoteButton'
import { BuyerMatchCard } from '@/components/pipelines/BuyerMatchCard'
import { PropertyEditPanel } from '@/components/leads/PropertyEditPanel'
import { ActivityCard } from '@/components/leads/ActivityCard'
import { PropertyCommsCard } from '@/components/leads/PropertyCommsCard'
import { PropertyAppointmentsCard } from '@/components/leads/PropertyAppointmentsCard'
import { DetailPageTabs, type TabDef } from '@/components/shared/DetailPageTabs'
import { DocumentsEmptyState } from '@/components/shared/DocumentsEmptyState'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'comms', label: 'Communications' },
  { key: 'notes', label: 'Notes' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'documents', label: 'Documents' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'activity', label: 'Activity' },
]

export default async function DispoDetailPage({ params, searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const { tab = 'overview' } = await searchParams
  const [property, users] = await Promise.all([
    getPropertyById(id),
    prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  if (!property) notFound()

  const promoteOptions = [
    { toStatus: 'SOLD', label: 'Mark as Sold', color: 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200' },
    { toStatus: 'IN_INVENTORY', label: 'Move to Inventory', color: 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200' },
    { toStatus: 'DEAD', label: 'Remove / Dead', color: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200' },
  ]

  return (
    <div>
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 -mx-5 px-5 pt-3 pb-0">
        <Link href="/dispo" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2">
          <ChevronLeft className="w-4 h-4" />
          Dispo
        </Link>
        <PipelineDetailHeader
          id={property.id}
          pipeline="dispo"
          streetAddress={property.streetAddress}
          city={property.city}
          state={property.state}
          zip={property.zip}
          propertyStatus={property.propertyStatus}
          tmStage={property.tmStage}
          inventoryStage={property.inventoryStage}
          isHot={property.isHot}
          isFavorited={property.isFavorited}
          contractDate={property.contractDate}
          source={property.source}
          createdAt={property.createdAt}
        />
        <DetailPageTabs tabs={TABS} activeTab={tab} />
      </div>

      <div className="pt-5">
        {tab === 'overview' && (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-4">
              <BuyerMatchCard
                propertyId={property.id}
                buyerMatches={property.buyerMatches as any}
                offers={property.offers as any}
              />
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Property Details</h3>
                <dl className="space-y-1.5 text-sm">
                  {([
                    ['Bedrooms', property.bedrooms],
                    ['Bathrooms', property.bathrooms?.toString()],
                    ['Sq Ft', property.sqft?.toLocaleString()],
                    ['Asking Price', property.askingPrice ? `$${Number(property.askingPrice).toLocaleString()}` : null],
                    ['ARV', property.arv ? `$${Number(property.arv).toLocaleString()}` : null],
                    ['Exit Strategy', property.exitStrategy?.replace(/_/g, ' ')],
                  ] as [string, unknown][]).filter(([, v]) => v != null).map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="text-gray-900 font-medium">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <div className="space-y-4">
              <PromoteButton propertyId={property.id} options={promoteOptions} />
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
                  assignedToId: property.assignedToId ?? null,
                  tags: property.tags,
                }}
                users={users}
              />
            </div>
          </div>
        )}
        {tab === 'contacts' && (
          <ContactsCard propertyId={property.id} contacts={property.contacts as any} />
        )}
        {tab === 'comms' && (
          <PropertyCommsCard propertyId={property.id} />
        )}
        {tab === 'notes' && (
          <NotesCard propertyId={property.id} notes={property.notes as any} />
        )}
        {tab === 'tasks' && (
          <TasksCard propertyId={property.id} tasks={property.tasks as any} />
        )}
        {tab === 'documents' && <DocumentsEmptyState />}
        {tab === 'appointments' && (
          <PropertyAppointmentsCard propertyId={property.id} />
        )}
        {tab === 'activity' && (
          <ActivityCard
            activityLogs={property.activityLogs as any}
            stageHistory={property.stageHistory as any}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/dispo/\[id\]/page.tsx
git commit -m "feat: refactor Dispo detail page to 8-tab sticky layout"
```

---

## Task 9: Refactor `sold/[id]/page.tsx`

**Files:**
- Modify: `apps/web/src/app/(app)/sold/[id]/page.tsx`

8 tabs. No PromoteButton. Uses `ArchiveDetailHeader` (not LeadDetailHeader or PipelineDetailHeader). Overview: Sale Details card + PropertyEditPanel.

- [ ] **Step 1: Replace the entire file**

```tsx
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getPropertyById } from '@/lib/pipelines'
import { ArchiveDetailHeader } from '@/components/archive/ArchiveDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { NotesCard } from '@/components/leads/NotesCard'
import { TasksCard } from '@/components/leads/TasksCard'
import { ActivityCard } from '@/components/leads/ActivityCard'
import { PropertyEditPanel } from '@/components/leads/PropertyEditPanel'
import { PropertyCommsCard } from '@/components/leads/PropertyCommsCard'
import { PropertyAppointmentsCard } from '@/components/leads/PropertyAppointmentsCard'
import { DetailPageTabs, type TabDef } from '@/components/shared/DetailPageTabs'
import { DocumentsEmptyState } from '@/components/shared/DocumentsEmptyState'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'comms', label: 'Communications' },
  { key: 'notes', label: 'Notes' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'documents', label: 'Documents' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'activity', label: 'Activity' },
]

export default async function SoldDetailPage({ params, searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const { tab = 'overview' } = await searchParams
  const [property, users] = await Promise.all([
    getPropertyById(id),
    prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  if (!property) notFound()

  return (
    <div>
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 -mx-5 px-5 pt-3 pb-0">
        <Link href="/sold" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2">
          <ChevronLeft className="w-4 h-4" />
          Sold
        </Link>
        <ArchiveDetailHeader
          id={property.id}
          type="sold"
          streetAddress={property.streetAddress}
          city={property.city}
          state={property.state}
          zip={property.zip}
          isHot={property.isHot}
          isFavorited={property.isFavorited}
          source={property.source}
          soldAt={property.soldAt}
          createdAt={property.createdAt}
        />
        <DetailPageTabs tabs={TABS} activeTab={tab} />
      </div>

      <div className="pt-5">
        {tab === 'overview' && (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Sale Details</h3>
                <dl className="space-y-1.5 text-sm">
                  {([
                    ['Sale Price', property.offerPrice ? `$${Number(property.offerPrice).toLocaleString()}` : null],
                    ['ARV', property.arv ? `$${Number(property.arv).toLocaleString()}` : null],
                    ['Repair Est.', property.repairEstimate ? `$${Number(property.repairEstimate).toLocaleString()}` : null],
                    ['Exit Strategy', property.exitStrategy?.replace(/_/g, ' ')],
                    ['Bedrooms', property.bedrooms],
                    ['Sq Ft', property.sqft?.toLocaleString()],
                  ] as [string, unknown][]).filter(([, v]) => v != null).map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="text-gray-900 font-medium">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <div>
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
                  assignedToId: property.assignedToId ?? null,
                  tags: property.tags,
                }}
                users={users}
              />
            </div>
          </div>
        )}
        {tab === 'contacts' && (
          <ContactsCard propertyId={property.id} contacts={property.contacts as any} />
        )}
        {tab === 'comms' && (
          <PropertyCommsCard propertyId={property.id} />
        )}
        {tab === 'notes' && (
          <NotesCard propertyId={property.id} notes={property.notes as any} />
        )}
        {tab === 'tasks' && (
          <TasksCard propertyId={property.id} tasks={property.tasks as any} />
        )}
        {tab === 'documents' && <DocumentsEmptyState />}
        {tab === 'appointments' && (
          <PropertyAppointmentsCard propertyId={property.id} />
        )}
        {tab === 'activity' && (
          <ActivityCard
            activityLogs={property.activityLogs as any}
            stageHistory={property.stageHistory as any}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/sold/\[id\]/page.tsx
git commit -m "feat: refactor Sold detail page to 8-tab sticky layout"
```

---

## Task 10: Refactor `rental/[id]/page.tsx`

**Files:**
- Modify: `apps/web/src/app/(app)/rental/[id]/page.tsx`

8 tabs. No PromoteButton. Uses `ArchiveDetailHeader` with `type="rental"`. Overview: Rental Details card + PropertyEditPanel.

- [ ] **Step 1: Replace the entire file**

```tsx
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getPropertyById } from '@/lib/pipelines'
import { ArchiveDetailHeader } from '@/components/archive/ArchiveDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { NotesCard } from '@/components/leads/NotesCard'
import { TasksCard } from '@/components/leads/TasksCard'
import { ActivityCard } from '@/components/leads/ActivityCard'
import { PropertyEditPanel } from '@/components/leads/PropertyEditPanel'
import { PropertyCommsCard } from '@/components/leads/PropertyCommsCard'
import { PropertyAppointmentsCard } from '@/components/leads/PropertyAppointmentsCard'
import { DetailPageTabs, type TabDef } from '@/components/shared/DetailPageTabs'
import { DocumentsEmptyState } from '@/components/shared/DocumentsEmptyState'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'comms', label: 'Communications' },
  { key: 'notes', label: 'Notes' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'documents', label: 'Documents' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'activity', label: 'Activity' },
]

export default async function RentalDetailPage({ params, searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const { tab = 'overview' } = await searchParams
  const [property, users] = await Promise.all([
    getPropertyById(id),
    prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  if (!property) notFound()

  return (
    <div>
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 -mx-5 px-5 pt-3 pb-0">
        <Link href="/rental" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2">
          <ChevronLeft className="w-4 h-4" />
          Rental
        </Link>
        <ArchiveDetailHeader
          id={property.id}
          type="rental"
          streetAddress={property.streetAddress}
          city={property.city}
          state={property.state}
          zip={property.zip}
          isHot={property.isHot}
          isFavorited={property.isFavorited}
          source={property.source}
          soldAt={property.soldAt}
          createdAt={property.createdAt}
        />
        <DetailPageTabs tabs={TABS} activeTab={tab} />
      </div>

      <div className="pt-5">
        {tab === 'overview' && (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Rental Details</h3>
                <dl className="space-y-1.5 text-sm">
                  {([
                    ['Asking Price', property.askingPrice ? `$${Number(property.askingPrice).toLocaleString()}` : null],
                    ['ARV', property.arv ? `$${Number(property.arv).toLocaleString()}` : null],
                    ['Repair Est.', property.repairEstimate ? `$${Number(property.repairEstimate).toLocaleString()}` : null],
                    ['Exit Strategy', property.exitStrategy?.replace(/_/g, ' ')],
                    ['Bedrooms', property.bedrooms],
                    ['Bathrooms', property.bathrooms?.toString()],
                    ['Sq Ft', property.sqft?.toLocaleString()],
                    ['Year Built', property.yearBuilt],
                  ] as [string, unknown][]).filter(([, v]) => v != null).map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="text-gray-900 font-medium">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <div>
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
                  assignedToId: property.assignedToId ?? null,
                  tags: property.tags,
                }}
                users={users}
              />
            </div>
          </div>
        )}
        {tab === 'contacts' && (
          <ContactsCard propertyId={property.id} contacts={property.contacts as any} />
        )}
        {tab === 'comms' && (
          <PropertyCommsCard propertyId={property.id} />
        )}
        {tab === 'notes' && (
          <NotesCard propertyId={property.id} notes={property.notes as any} />
        )}
        {tab === 'tasks' && (
          <TasksCard propertyId={property.id} tasks={property.tasks as any} />
        )}
        {tab === 'documents' && <DocumentsEmptyState />}
        {tab === 'appointments' && (
          <PropertyAppointmentsCard propertyId={property.id} />
        )}
        {tab === 'activity' && (
          <ActivityCard
            activityLogs={property.activityLogs as any}
            stageHistory={property.stageHistory as any}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/rental/\[id\]/page.tsx
git commit -m "feat: refactor Rental detail page to 8-tab sticky layout"
```

---

## Task 11: Build Verification

- [ ] **Step 1: Run all tests**

```bash
cd apps/web && pnpm test --run 2>&1 | tail -20
```

Expected: All existing tests pass (64/64 or more). No new failures.

- [ ] **Step 2: Full TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Production build**

```bash
cd apps/web && pnpm build 2>&1 | tail -30
```

Expected: Build completes with zero errors. All 7 detail page routes appear in the build output (e.g., `/leads/dts/[id]`, `/leads/dta/[id]`, `/tm/[id]`, `/inventory/[id]`, `/dispo/[id]`, `/sold/[id]`, `/rental/[id]`).

- [ ] **Step 4: Manual smoke test (dev server)**

```bash
cd apps/web && pnpm dev
```

Navigate to any detail page (e.g. `/leads/dts/{someId}`). Verify:
1. Property header sticks to top on scroll
2. Tab bar sticks below header on scroll
3. Clicking a tab changes the URL to `?tab=<key>` without scrolling to top
4. Each tab renders its correct content (no blank screens, no runtime errors)
5. Refreshing the page with `?tab=comms` in the URL loads the Communications tab directly
6. The Communications tab shows the message thread and log form
7. The Appointments tab shows the list and an "Add" button that opens the modal

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: phase 11 complete — 9-tab sticky detail pages with comms + appointments"
```

---

## Verification Summary

| Check | Expected |
|-------|----------|
| `tsc --noEmit` | Zero errors |
| `pnpm test --run` | All tests pass |
| `pnpm build` | Zero errors, all 7 routes built |
| Tab URL state | `?tab=comms` → loads Communications tab on refresh |
| Sticky header | Header + tabs remain visible while scrolling tab content |
| Comms tab | Shows MessageThread (or empty state) + LogCommunicationForm |
| Appointments tab | Shows AppointmentList + Add button → modal opens |
| Documents tab | Shows empty state with icon and placeholder text |
| AI tab (DTS/DTA only) | Shows PropertyAIPanel and PropertyChatPanel |
