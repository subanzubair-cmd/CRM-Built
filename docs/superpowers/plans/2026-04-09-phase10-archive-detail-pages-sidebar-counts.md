# Phase 10 — Archive Detail Pages + Sidebar Live Counts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the CRM by adding clickable Sold/Rental property detail pages, fixing archive table navigation, adding pagination to archive views, and wiring live lead counts as badges in the sidebar.

**Architecture:** Sold/Rental detail pages reuse `getPropertyById` (already fetches contacts, notes, tasks, activity), a new `ArchiveDetailHeader` client component handles hot/fav toggles via PATCH, and `PropertyEditPanel` / `ContactsCard` / `NotesCard` / `TasksCard` / `ActivityCard` are dropped in identically to other pipelines. `ArchiveTable` navigation is fixed to go to `/sold/[id]` or `/rental/[id]` based on the `type` prop. Sidebar live counts come from three `prisma.property.count` calls in the layout, passed as a `counts` prop into the existing `Sidebar` client component.

**Tech Stack:** Next.js 15 App Router, Prisma 7, `lucide-react`, `date-fns`, Vitest

---

## Existing API Contracts (MEMORIZE THESE)

```
PATCH /api/leads/:id   body: { isHot?: boolean, isFavorited?: boolean, ... }

getPropertyById(id) → Property with:
  id, streetAddress, city, state, zip, propertyStatus, isHot, isFavorited
  source, soldAt, createdAt, exitStrategy, offerPrice, askingPrice, arv
  repairEstimate, bedrooms, bathrooms, sqft, yearBuilt, lotSize, propertyType
  campaignName, assignedToId, tags
  contacts[], notes[], tasks[], activityLogs[], stageHistory[], assignedTo, market

getSoldList({ page?, pageSize?, search?, assignedToId? }) → { rows, total, page, pageSize }
getRentalList(...)                                        → { rows, total, page, pageSize }

prisma.property.count({ where: { leadType, leadStatus } }) — for sidebar counts
```

---

## File Map

**Create:**
- `apps/web/src/components/archive/ArchiveDetailHeader.tsx` — client component, hot/fav toggles, status badge, sold date
- `apps/web/src/app/(app)/sold/[id]/page.tsx` — Sold property detail page
- `apps/web/src/app/(app)/rental/[id]/page.tsx` — Rental property detail page

**Modify:**
- `apps/web/src/lib/__tests__/archive.test.ts` — 2 new pagination tests
- `apps/web/src/components/archive/ArchiveTable.tsx` — fix nav + add page/pageSize + Pagination
- `apps/web/src/app/(app)/sold/page.tsx` — thread page/pageSize through
- `apps/web/src/app/(app)/rental/page.tsx` — thread page/pageSize through
- `apps/web/src/app/(app)/layout.tsx` — fetch 3 count queries, pass to Sidebar
- `apps/web/src/components/layout/Sidebar.tsx` — accept counts prop, show live badges

---

### Task 1: Archive pagination tests (2 new → 64 total)

**Files:**
- Modify: `apps/web/src/lib/__tests__/archive.test.ts`

- [ ] **Step 1: Add 2 tests to archive.test.ts**

Append inside `describe('getSoldList', ...)` block and inside `describe('getRentalList', ...)` block:

```typescript
// Inside describe('getSoldList', ...)
  it('paginates with correct skip for page 2', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getSoldList({ page: 2, pageSize: 50 })

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50 })
    )
  })

// Inside describe('getRentalList', ...)
  it('returns page and pageSize in result', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    const result = await getRentalList({ page: 3, pageSize: 25 })

    expect(result.page).toBe(3)
    expect(result.pageSize).toBe(25)
  })
```

- [ ] **Step 2: Run full test suite**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run 2>&1 | tail -6
```

Expected: `64 passed (17 files)`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/__tests__/archive.test.ts
git commit -m "test: add pagination tests for getSoldList and getRentalList"
```

---

### Task 2: Fix ArchiveTable + add pagination + wire list pages

**Files:**
- Modify: `apps/web/src/components/archive/ArchiveTable.tsx`
- Modify: `apps/web/src/app/(app)/sold/page.tsx`
- Modify: `apps/web/src/app/(app)/rental/page.tsx`

- [ ] **Step 1: Replace `ArchiveTable.tsx`**

```tsx
'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Pagination } from '@/components/ui/Pagination'

interface ArchiveRow {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  leadType: string
  propertyStatus: string
  soldAt: Date | null
  offerPrice: unknown
  exitStrategy: string | null
  updatedAt: Date
  contacts: Array<{
    contact: { firstName: string; lastName: string | null; phone: string | null }
  }>
  assignedTo: { name: string } | null
}

interface Props {
  rows: ArchiveRow[]
  total: number
  type: 'sold' | 'rental'
  page: number
  pageSize: number
}

const EXIT_STRATEGY_LABELS: Record<string, string> = {
  WHOLESALE:       'Wholesale',
  SELLER_FINANCE:  'Seller Finance',
  INSTALLMENT:     'Installment',
  FIX_AND_FLIP:    'Fix & Flip',
  INVENTORY_LATER: 'Inventory',
  RENTAL:          'Rental',
  TURNKEY:         'Turnkey',
}

export function ArchiveTable({ rows, total, type, page, pageSize }: Props) {
  const router = useRouter()

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No {type === 'sold' ? 'sold' : 'rental'} properties yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
        {total} propert{total !== 1 ? 'ies' : 'y'}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
            <th className="text-left px-4 py-2.5">Address</th>
            <th className="text-left px-4 py-2.5">Contact</th>
            <th className="text-left px-4 py-2.5">Exit Strategy</th>
            {type === 'sold' && <th className="text-left px-4 py-2.5">Sale Price</th>}
            {type === 'sold' && <th className="text-left px-4 py-2.5">Sold Date</th>}
            <th className="text-left px-4 py-2.5">Assigned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const primary = row.contacts[0]?.contact
            const detailPath = `/${type}/${row.id}`
            return (
              <tr
                key={row.id}
                onClick={() => router.push(detailPath)}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{row.streetAddress ?? '—'}</p>
                  <p className="text-[11px] text-gray-400">{[row.city, row.state].filter(Boolean).join(', ')}</p>
                </td>
                <td className="px-4 py-3">
                  {primary ? (
                    <div>
                      <p className="text-gray-800">{[primary.firstName, primary.lastName].filter(Boolean).join(' ')}</p>
                      <p className="text-[11px] text-gray-400">{primary.phone ?? '—'}</p>
                    </div>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  {row.exitStrategy ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">
                      {EXIT_STRATEGY_LABELS[row.exitStrategy] ?? row.exitStrategy}
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                {type === 'sold' && (
                  <td className="px-4 py-3 text-gray-800 font-medium">
                    {row.offerPrice ? `$${Number(row.offerPrice).toLocaleString()}` : <span className="text-gray-300">—</span>}
                  </td>
                )}
                {type === 'sold' && (
                  <td className="px-4 py-3 text-[11px] text-gray-500">
                    {row.soldAt ? format(new Date(row.soldAt), 'MMM d, yyyy') : <span className="text-gray-300">—</span>}
                  </td>
                )}
                <td className="px-4 py-3 text-gray-600">{row.assignedTo?.name ?? <span className="text-gray-300">—</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Suspense>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 2: Update `sold/page.tsx`**

Replace entire file:

```tsx
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
        <LeadFilters users={users} showStageFilter={false} />
      </Suspense>
      <ArchiveTable rows={rows as any} total={total} type="sold" page={page} pageSize={pageSize} />
    </div>
  )
}
```

- [ ] **Step 3: Update `rental/page.tsx`**

Replace entire file:

```tsx
import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getRentalList } from '@/lib/archive'
import { prisma } from '@/lib/prisma'
import { ArchiveTable } from '@/components/archive/ArchiveTable'
import { LeadFilters } from '@/components/leads/LeadFilters'

interface PageProps {
  searchParams: Promise<{ search?: string; assignedToId?: string; page?: string }>
}

export default async function RentalPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const [{ rows, total, page, pageSize }, users] = await Promise.all([
    getRentalList({
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
      <h1 className="text-xl font-bold text-gray-900">Rental</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Archive of all rental properties</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} showStageFilter={false} />
      </Suspense>
      <ArchiveTable rows={rows as any} total={total} type="rental" page={page} pageSize={pageSize} />
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: no output (zero errors)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/archive/ArchiveTable.tsx \
        "apps/web/src/app/(app)/sold/page.tsx" \
        "apps/web/src/app/(app)/rental/page.tsx"
git commit -m "fix: archive table navigates to /sold/[id] and /rental/[id]; add pagination"
```

---

### Task 3: ArchiveDetailHeader component

**Files:**
- Create: `apps/web/src/components/archive/ArchiveDetailHeader.tsx`

- [ ] **Step 1: Create `ArchiveDetailHeader.tsx`**

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, Star } from 'lucide-react'
import { format } from 'date-fns'

interface Props {
  id: string
  type: 'sold' | 'rental'
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  isHot: boolean
  isFavorited: boolean
  source: string | null
  soldAt: Date | null
  createdAt: Date
}

export function ArchiveDetailHeader({
  id, type, streetAddress, city, state, zip,
  isHot, isFavorited, source, soldAt, createdAt,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  async function patch(data: Record<string, unknown>) {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    startTransition(() => router.refresh())
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-gray-900">
              {streetAddress ?? 'Address Unknown'}
            </h1>
            <button onClick={() => patch({ isHot: !isHot })} title="Toggle hot">
              {isHot ? '🔥' : <Flame className="w-4 h-4 text-gray-300" />}
            </button>
            <button onClick={() => patch({ isFavorited: !isFavorited })} title="Toggle favorite">
              <Star className={`w-4 h-4 ${isFavorited ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
            </button>
          </div>
          <p className="text-sm text-gray-500">
            {[city, state, zip].filter(Boolean).join(', ')}
            {source && <span className="ml-2 text-gray-400">· {source}</span>}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Added {format(new Date(createdAt), 'MMM d, yyyy')}
            {soldAt && type === 'sold' && (
              <> · Sold {format(new Date(soldAt), 'MMM d, yyyy')}</>
            )}
          </p>
        </div>

        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
          type === 'sold'
            ? 'bg-green-100 text-green-700'
            : 'bg-blue-100 text-blue-700'
        }`}>
          {type === 'sold' ? 'SOLD' : 'RENTAL'}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: no output (zero errors)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/archive/ArchiveDetailHeader.tsx
git commit -m "feat: add ArchiveDetailHeader component for sold/rental detail pages"
```

---

### Task 4: Sold detail page

**Files:**
- Create: `apps/web/src/app/(app)/sold/[id]/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/(app)/sold/[id]/page.tsx`**

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
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type Params = { params: Promise<{ id: string }> }

export default async function SoldDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const [property, users] = await Promise.all([
    getPropertyById(id),
    prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  if (!property) notFound()

  return (
    <div>
      <Link href="/sold" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
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

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <ContactsCard propertyId={property.id} contacts={property.contacts as any} />
          <NotesCard propertyId={property.id} notes={property.notes as any} />
          <ActivityCard
            activityLogs={property.activityLogs as any}
            stageHistory={property.stageHistory as any}
          />
        </div>
        <div className="space-y-4">
          <TasksCard propertyId={property.id} tasks={property.tasks as any} />
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
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: no output (zero errors)

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(app)/sold/[id]/page.tsx"
git commit -m "feat: add Sold property detail page with contacts, notes, activity, and edit panel"
```

---

### Task 5: Rental detail page

**Files:**
- Create: `apps/web/src/app/(app)/rental/[id]/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/(app)/rental/[id]/page.tsx`**

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
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type Params = { params: Promise<{ id: string }> }

export default async function RentalDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const [property, users] = await Promise.all([
    getPropertyById(id),
    prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  if (!property) notFound()

  return (
    <div>
      <Link href="/rental" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
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

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <ContactsCard propertyId={property.id} contacts={property.contacts as any} />
          <NotesCard propertyId={property.id} notes={property.notes as any} />
          <ActivityCard
            activityLogs={property.activityLogs as any}
            stageHistory={property.stageHistory as any}
          />
        </div>
        <div className="space-y-4">
          <TasksCard propertyId={property.id} tasks={property.tasks as any} />
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
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: no output (zero errors)

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(app)/rental/[id]/page.tsx"
git commit -m "feat: add Rental property detail page with contacts, notes, activity, and edit panel"
```

---

### Task 6: Sidebar live counts

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update `layout.tsx`** to fetch counts and pass to Sidebar

Replace the file:

```tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/Sidebar'
import { GlobalHeader } from '@/components/layout/GlobalHeader'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  const [dtsCount, dtaCount, warmCount] = await Promise.all([
    prisma.property.count({
      where: { leadType: 'DIRECT_TO_SELLER', leadStatus: 'ACTIVE' },
    }),
    prisma.property.count({
      where: { leadType: 'DIRECT_TO_AGENT', leadStatus: 'ACTIVE' },
    }),
    prisma.property.count({
      where: { leadStatus: 'WARM' },
    }),
  ])

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <GlobalHeader />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar counts={{ dts: dtsCount, dta: dtaCount, warm: warmCount }} />
        <main className="flex-1 overflow-auto p-5">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `Sidebar.tsx`** to accept counts and show badges

Replace the file:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface SidebarCounts {
  dts: number
  dta: number
  warm: number
}

interface NavItem {
  label: string
  href: string
  badge?: number
}

interface NavSection {
  label?: string
  items: NavItem[]
}

interface Props {
  counts?: SidebarCounts
}

function buildNav(counts: SidebarCounts): NavSection[] {
  return [
    {
      items: [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Inbox', href: '/inbox' },
        { label: 'Email Client', href: '/email' },
      ],
    },
    {
      label: 'Acquisition',
      items: [
        { label: 'Active Leads — DTS', href: '/leads/dts', badge: counts.dts > 0 ? counts.dts : undefined },
        { label: 'Active Leads — DTA', href: '/leads/dta', badge: counts.dta > 0 ? counts.dta : undefined },
        { label: 'Warm Leads', href: '/leads/warm', badge: counts.warm > 0 ? counts.warm : undefined },
        { label: 'Dead Leads', href: '/leads/dead' },
        { label: 'Referred to Agent', href: '/leads/referred' },
      ],
    },
    {
      label: 'Pipelines',
      items: [
        { label: 'Transaction Mgmt', href: '/tm' },
        { label: 'Dispo', href: '/dispo' },
        { label: 'Inventory', href: '/inventory' },
        { label: 'Sold', href: '/sold' },
        { label: 'Rental', href: '/rental' },
      ],
    },
    {
      label: 'Contacts',
      items: [
        { label: 'Buyers', href: '/buyers' },
        { label: 'Vendors', href: '/vendors' },
      ],
    },
    {
      label: 'Tools',
      items: [
        { label: 'Campaigns', href: '/campaigns' },
        { label: 'Calendar', href: '/calendar' },
        { label: 'Tasks', href: '/tasks' },
        { label: 'Activity', href: '/activity' },
        { label: 'List Stacking', href: '/list-stacking' },
      ],
    },
    {
      items: [
        { label: 'Analytics', href: '/analytics' },
        { label: 'Settings', href: '/settings' },
      ],
    },
  ]
}

export function Sidebar({ counts = { dts: 0, dta: 0, warm: 0 } }: Props) {
  const pathname = usePathname()
  const nav = buildNav(counts)

  return (
    <aside className="w-[228px] flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
      <nav className="py-2">
        {nav.map((section, sIdx) => (
          <div key={sIdx}>
            {sIdx > 0 && <div className="h-px bg-gray-100 my-1.5" />}
            {section.label && (
              <p className="px-4 pt-2.5 pb-1 text-[10.5px] font-bold text-gray-400 uppercase tracking-wider">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-4 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50',
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0',
                      isActive ? 'bg-blue-600' : 'bg-gray-300',
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-red-100 text-red-600 rounded-full px-1.5 py-0.5">
                      {item.badge > 999 ? '999+' : item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 3: TypeScript check**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: no output (zero errors)

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/layout.tsx" \
        apps/web/src/components/layout/Sidebar.tsx
git commit -m "feat: sidebar shows live DTS/DTA/Warm lead counts as badges"
```

---

### Task 7: Build verification

- [ ] **Step 1: Run full test suite**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run 2>&1 | tail -6
```

Expected: `64 passed (17 files)`

- [ ] **Step 2: TypeScript check**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: no output (zero errors)

- [ ] **Step 3: Production build**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd next build 2>&1 | tail -35
```

Expected:
- `/sold/[id]` shows `ƒ (Dynamic)`
- `/rental/[id]` shows `ƒ (Dynamic)`
- All other routes unchanged and `ƒ (Dynamic)`
- Zero build errors

---

## Self-Review

**Spec coverage:**
- ✅ Sold detail page — `/sold/[id]` shows contacts, notes, tasks, activity, sale details, edit panel
- ✅ Rental detail page — `/rental/[id]` shows contacts, notes, tasks, activity, rental details, edit panel
- ✅ ArchiveTable navigation — now goes to `/sold/[id]` and `/rental/[id]` (not broken `/leads/dts/[id]`)
- ✅ Archive pagination — sold/rental list views now show Prev/Next pagination
- ✅ Sidebar live counts — DTS, DTA, Warm badges populated from DB counts on every page load

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:**
- `SidebarCounts` interface defined in `Sidebar.tsx`, used only there — layout passes `{ dts, dta, warm }` matching exactly
- `ArchiveDetailHeader` Props: `soldAt: Date | null` — `getPropertyById` returns `Property` which has `soldAt: DateTime?` (maps to `Date | null` in Prisma TypeScript types) ✅
- `ArchiveTable` `type` prop is `'sold' | 'rental'` in both the component definition and all call sites ✅
