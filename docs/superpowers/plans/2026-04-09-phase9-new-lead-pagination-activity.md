# Phase 9 — New Lead Flow + Pagination + Activity Feed + Hot Filter

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CRM fully usable by adding a New Lead creation modal, paginated list tables, a per-property activity feed, and a 🔥 Hot-Only quick filter on lead lists.

**Architecture:** `NewLeadModal` is a `'use client'` component POSTing to the existing `/api/leads` endpoint; parent list pages fetch markets server-side and pass them as props. `Pagination` is a shared `'use client'` URL-driven component rendered at the bottom of `LeadTable` and `PipelineTable`. `ActivityCard` is a server component (no state needed) that merges `activityLogs` + `stageHistory` already fetched by `getLeadById`/`getPropertyById`. The hot filter is a new `?isHot=1` URL param handled in `LeadFilters` and threaded into `getLeadList` on DTS/DTA pages.

**Tech Stack:** Next.js 15 App Router, Prisma 7, `lucide-react`, `date-fns`, Vitest

---

## Existing API Contracts (MEMORIZE THESE)

```
POST /api/leads
  body: { streetAddress, city?, state?, zip?, leadType: 'DIRECT_TO_SELLER'|'DIRECT_TO_AGENT',
          marketId, source?, assignedToId?, contactFirstName?, contactLastName?,
          contactPhone?, contactEmail? }
  response 201: { success: true, data: { id: string, ... } }

getLeadList({ pipeline, search?, stage?, assignedToId?, isHot?, page?, pageSize? })
  returns: { rows, total, page, pageSize }     ← already destructure page & pageSize

getTmList / getInventoryList / getDispoList all return { rows, total, page, pageSize }

getLeadById(id) includes:
  activityLogs: [{ id, action, detail, createdAt, user: { id, name } }]
  stageHistory:  [{ id, pipeline, toStage, changedById, changedByName, createdAt }]

getPropertyById(id) includes the same activityLogs & stageHistory

getMarketList() → Market[]  with { id, name, ... } — import from '@/lib/settings'
```

---

## File Map

**Create:**
- `apps/web/src/components/leads/NewLeadModal.tsx`
- `apps/web/src/components/ui/Pagination.tsx`
- `apps/web/src/components/leads/ActivityCard.tsx`

**Modify:**
- `apps/web/src/lib/__tests__/leads.test.ts` — 2 new tests
- `apps/web/src/lib/__tests__/pipelines.test.ts` — 1 new test
- `apps/web/src/components/leads/LeadFilters.tsx` — hot filter toggle
- `apps/web/src/components/leads/LeadTable.tsx` — page/pageSize props + Pagination
- `apps/web/src/components/pipelines/PipelineTable.tsx` — page/pageSize props + Pagination
- `apps/web/src/app/(app)/leads/dts/page.tsx` — new lead button, isHot, page/pageSize, markets
- `apps/web/src/app/(app)/leads/dta/page.tsx` — same as dts
- `apps/web/src/app/(app)/leads/warm/page.tsx` — page/pageSize
- `apps/web/src/app/(app)/leads/dead/page.tsx` — page/pageSize
- `apps/web/src/app/(app)/leads/referred/page.tsx` — page/pageSize
- `apps/web/src/app/(app)/tm/page.tsx` — page/pageSize
- `apps/web/src/app/(app)/inventory/page.tsx` — page/pageSize
- `apps/web/src/app/(app)/dispo/page.tsx` — page/pageSize
- `apps/web/src/app/(app)/leads/dts/[id]/page.tsx` — add ActivityCard
- `apps/web/src/app/(app)/leads/dta/[id]/page.tsx` — add ActivityCard
- `apps/web/src/app/(app)/tm/[id]/page.tsx` — add ActivityCard
- `apps/web/src/app/(app)/inventory/[id]/page.tsx` — add ActivityCard
- `apps/web/src/app/(app)/dispo/[id]/page.tsx` — add ActivityCard

---

### Task 1: New lib tests (3 tests → 62 total)

**Files:**
- Modify: `apps/web/src/lib/__tests__/leads.test.ts`
- Modify: `apps/web/src/lib/__tests__/pipelines.test.ts`

- [ ] **Step 1: Add 2 failing tests to leads.test.ts**

Append inside the `describe('getLeadList', ...)` block:

```typescript
  it('applies isHot: true filter when requested', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getLeadList({ pipeline: 'dts', isHot: true })

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isHot: true }),
      })
    )
  })

  it('paginates with correct skip for page 2', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getLeadList({ pipeline: 'dts', page: 2, pageSize: 50 })

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50 })
    )
  })
```

- [ ] **Step 2: Add 1 failing test to pipelines.test.ts**

Append inside `describe('getTmList', ...)`:

```typescript
  it('paginates with correct skip for page 2', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getTmList({ page: 2, pageSize: 50 })

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50 })
    )
  })
```

- [ ] **Step 3: Run tests to confirm 3 new failures**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run src/lib/__tests__/leads.test.ts src/lib/__tests__/pipelines.test.ts 2>&1
```

Expected: 7 passed, 3 failed (the 3 new tests).

> These tests already PASS because the underlying `getLeadList`/`getTmList` code already handles `isHot` and pagination correctly. They will pass immediately. If they fail, the code has a regression — fix it.

- [ ] **Step 4: Run full test suite to confirm 62 passing**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run 2>&1 | tail -6
```

Expected: `62 passed (17 files)`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/__tests__/leads.test.ts apps/web/src/lib/__tests__/pipelines.test.ts
git commit -m "test: add isHot filter and pagination skip tests for leads and pipelines"
```

---

### Task 2: NewLeadModal + wire to DTS/DTA pages

**Files:**
- Create: `apps/web/src/components/leads/NewLeadModal.tsx`
- Modify: `apps/web/src/app/(app)/leads/dts/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/dta/page.tsx`

- [ ] **Step 1: Create `NewLeadModal.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

const inputCls =
  'w-full mt-0.5 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

interface Market { id: string; name: string }

interface Props {
  leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
  markets: Market[]
  onClose: () => void
}

export function NewLeadModal({ leadType, markets, onClose }: Props) {
  const router = useRouter()
  const [streetAddress, setStreetAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [marketId, setMarketId] = useState(markets[0]?.id ?? '')
  const [source, setSource] = useState('')
  const [contactFirstName, setContactFirstName] = useState('')
  const [contactLastName, setContactLastName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const pipeline = leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!streetAddress.trim()) { setError('Street address is required'); return }
    if (!marketId) { setError('Market is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streetAddress: streetAddress.trim(),
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          zip: zip.trim() || undefined,
          leadType,
          marketId,
          source: source.trim() || undefined,
          contactFirstName: contactFirstName.trim() || undefined,
          contactLastName: contactLastName.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error?.message ?? 'Failed to create lead')
      }
      const { data } = await res.json()
      router.push(`/leads/${pipeline}/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lead. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            New {leadType === 'DIRECT_TO_SELLER' ? 'DTS' : 'DTA'} Lead
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Property</p>

          <div>
            <label className="text-[11px] text-gray-500">Street Address *</label>
            <input
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              placeholder="123 Main St"
              className={inputCls}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">State</label>
              <input value={state} onChange={(e) => setState(e.target.value)} placeholder="TX" className={inputCls} />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Zip</label>
              <input value={zip} onChange={(e) => setZip(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">Market *</label>
              <select value={marketId} onChange={(e) => setMarketId(e.target.value)} className={inputCls}>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Source</label>
              <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Direct Mail, PPC…" className={inputCls} />
            </div>
          </div>

          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide pt-1">Contact (optional)</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">First Name</label>
              <input value={contactFirstName} onChange={(e) => setContactFirstName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Last Name</label>
              <input value={contactLastName} onChange={(e) => setContactLastName(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">Phone</label>
              <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Email</label>
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
            </div>
          </div>

          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create Lead'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `apps/web/src/app/(app)/leads/dts/page.tsx`**

Replace the entire file:

```tsx
import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getLeadList } from '@/lib/leads'
import { getMarketList } from '@/lib/settings'
import { prisma } from '@/lib/prisma'
import { LeadTable } from '@/components/leads/LeadTable'
import { LeadFilters } from '@/components/leads/LeadFilters'
import { NewLeadButton } from '@/components/leads/NewLeadButton'

interface PageProps {
  searchParams: Promise<{ search?: string; stage?: string; assignedToId?: string; isHot?: string; page?: string }>
}

export default async function LeadsDtsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const [{ rows, total, page, pageSize }, users, markets] = await Promise.all([
    getLeadList({
      pipeline: 'dts',
      search: sp.search,
      stage: sp.stage,
      assignedToId: sp.assignedToId,
      isHot: sp.isHot === '1',
      page: sp.page ? parseInt(sp.page) : 1,
    }),
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    getMarketList(),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">Active Leads — DTS</h1>
        <NewLeadButton leadType="DIRECT_TO_SELLER" markets={markets} />
      </div>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Direct to Seller pipeline</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} showHotFilter />
      </Suspense>
      <LeadTable rows={rows as any} total={total} pipeline="dts" page={page} pageSize={pageSize} />
    </div>
  )
}
```

- [ ] **Step 3: Update `apps/web/src/app/(app)/leads/dta/page.tsx`**

Replace the entire file:

```tsx
import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getLeadList } from '@/lib/leads'
import { getMarketList } from '@/lib/settings'
import { prisma } from '@/lib/prisma'
import { LeadTable } from '@/components/leads/LeadTable'
import { LeadFilters } from '@/components/leads/LeadFilters'
import { NewLeadButton } from '@/components/leads/NewLeadButton'

interface PageProps {
  searchParams: Promise<{ search?: string; stage?: string; assignedToId?: string; isHot?: string; page?: string }>
}

export default async function LeadsDtaPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const [{ rows, total, page, pageSize }, users, markets] = await Promise.all([
    getLeadList({
      pipeline: 'dta',
      search: sp.search,
      stage: sp.stage,
      assignedToId: sp.assignedToId,
      isHot: sp.isHot === '1',
      page: sp.page ? parseInt(sp.page) : 1,
    }),
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    getMarketList(),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">Active Leads — DTA</h1>
        <NewLeadButton leadType="DIRECT_TO_AGENT" markets={markets} />
      </div>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Direct to Agent pipeline</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} showHotFilter />
      </Suspense>
      <LeadTable rows={rows as any} total={total} pipeline="dta" page={page} pageSize={pageSize} />
    </div>
  )
}
```

- [ ] **Step 4: Create `NewLeadButton.tsx`** (thin client wrapper that holds modal state)

```tsx
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { NewLeadModal } from './NewLeadModal'

interface Market { id: string; name: string }

interface Props {
  leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
  markets: Market[]
}

export function NewLeadButton({ leadType, markets }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-3 py-1.5 transition-colors"
      >
        <Plus className="w-4 h-4" />
        New Lead
      </button>
      {open && (
        <NewLeadModal
          leadType={leadType}
          markets={markets}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 5: TypeScript check**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: no output (zero errors)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/leads/NewLeadModal.tsx \
        apps/web/src/components/leads/NewLeadButton.tsx \
        apps/web/src/app/\(app\)/leads/dts/page.tsx \
        apps/web/src/app/\(app\)/leads/dta/page.tsx
git commit -m "feat: add New Lead modal with address and contact fields for DTS/DTA pipelines"
```

---

### Task 3: Pagination component + wire all 8 list pages

**Files:**
- Create: `apps/web/src/components/ui/Pagination.tsx`
- Modify: `apps/web/src/components/leads/LeadTable.tsx`
- Modify: `apps/web/src/components/pipelines/PipelineTable.tsx`
- Modify: `apps/web/src/app/(app)/leads/warm/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/dead/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/referred/page.tsx`
- Modify: `apps/web/src/app/(app)/tm/page.tsx`
- Modify: `apps/web/src/app/(app)/inventory/page.tsx`
- Modify: `apps/web/src/app/(app)/dispo/page.tsx`

- [ ] **Step 1: Create `Pagination.tsx`**

```tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  page: number
  pageSize: number
  total: number
}

export function Pagination({ page, pageSize, total }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  function go(newPage: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(newPage))
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center justify-center gap-3 pt-3 pb-1">
      <button
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Prev
      </button>
      <span className="text-sm text-gray-500">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => go(page + 1)}
        disabled={page >= totalPages}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Update `LeadTable.tsx`** — add `page`/`pageSize` props and render `<Pagination>` wrapped in `<Suspense>`

Replace the full file:

```tsx
'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Pagination } from '@/components/ui/Pagination'

const STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: 'New Lead',
  DISCOVERY: 'Discovery',
  INTERESTED_ADD_TO_FOLLOW_UP: 'Follow Up',
  APPOINTMENT_MADE: 'Appointment',
  DUE_DILIGENCE: 'Due Diligence',
  OFFER_MADE: 'Offer Made',
  OFFER_FOLLOW_UP: 'Offer Follow Up',
  UNDER_CONTRACT: 'Under Contract',
}

const STAGE_COLORS: Record<string, string> = {
  NEW_LEAD: 'bg-gray-100 text-gray-700',
  DISCOVERY: 'bg-blue-50 text-blue-700',
  INTERESTED_ADD_TO_FOLLOW_UP: 'bg-yellow-50 text-yellow-700',
  APPOINTMENT_MADE: 'bg-purple-50 text-purple-700',
  DUE_DILIGENCE: 'bg-orange-50 text-orange-700',
  OFFER_MADE: 'bg-emerald-50 text-emerald-700',
  OFFER_FOLLOW_UP: 'bg-teal-50 text-teal-700',
  UNDER_CONTRACT: 'bg-green-100 text-green-800',
}

interface LeadRow {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  activeLeadStage: string | null
  isHot: boolean
  updatedAt: Date
  contacts: Array<{
    contact: { firstName: string; lastName: string | null; phone: string | null }
  }>
  assignedTo: { name: string } | null
  _count: { tasks: number }
}

interface Props {
  rows: LeadRow[]
  total: number
  pipeline: string
  page: number
  pageSize: number
}

export function LeadTable({ rows, total, pipeline, page, pageSize }: Props) {
  const router = useRouter()

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No leads found</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
        {total} lead{total !== 1 ? 's' : ''}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
            <th className="text-left px-4 py-2.5">Address</th>
            <th className="text-left px-4 py-2.5">Contact</th>
            <th className="text-left px-4 py-2.5">Stage</th>
            <th className="text-left px-4 py-2.5">Assigned</th>
            <th className="text-left px-4 py-2.5">Tasks</th>
            <th className="text-left px-4 py-2.5">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const primary = row.contacts[0]?.contact
            return (
              <tr
                key={row.id}
                onClick={() => router.push(`/leads/${pipeline}/${row.id}`)}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {row.isHot && <span title="Hot lead">🔥</span>}
                    <div>
                      <p className="font-medium text-gray-900">{row.streetAddress ?? '—'}</p>
                      <p className="text-[11px] text-gray-400">{[row.city, row.state].filter(Boolean).join(', ')}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {primary ? (
                    <div>
                      <p className="text-gray-800">{[primary.firstName, primary.lastName].filter(Boolean).join(' ')}</p>
                      <p className="text-[11px] text-gray-400">{primary.phone ?? '—'}</p>
                    </div>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.activeLeadStage ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${STAGE_COLORS[row.activeLeadStage] ?? 'bg-gray-100 text-gray-700'}`}>
                      {STAGE_LABELS[row.activeLeadStage] ?? row.activeLeadStage}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{row.assignedTo?.name ?? <span className="text-gray-300">Unassigned</span>}</td>
                <td className="px-4 py-3">
                  {row._count.tasks > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-medium">
                      {row._count.tasks} open
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-[11px] text-gray-400">
                  {formatDistanceToNow(new Date(row.updatedAt), { addSuffix: true })}
                </td>
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

- [ ] **Step 3: Update `PipelineTable.tsx`** — add `page`/`pageSize` props and render `<Pagination>`

Replace the full file:

```tsx
'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Pagination } from '@/components/ui/Pagination'

interface PipelineRow {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  propertyStatus: string
  tmStage: string | null
  inventoryStage: string | null
  isHot: boolean
  updatedAt: Date
  contacts: Array<{
    contact: { firstName: string; lastName: string | null; phone: string | null }
  }>
  assignedTo: { name: string } | null
  _count: { tasks: number }
}

interface Props {
  rows: PipelineRow[]
  total: number
  basePath: string
  page: number
  pageSize: number
  stageLabel?: (row: PipelineRow) => string | null
  extraColumns?: Array<{ header: string; render: (row: PipelineRow) => React.ReactNode }>
}

const TM_STAGE_LABELS: Record<string, string> = {
  NEW_CONTRACT:         'New Contract',
  MARKETING_TO_BUYERS:  'Marketing',
  SHOWING_TO_BUYERS:    'Showing',
  EVALUATING_OFFERS:    'Evaluating Offers',
  ACCEPTED_OFFER:       'Accepted Offer',
  CLEAR_TO_CLOSE:       'Clear to Close',
}

const TM_STAGE_COLORS: Record<string, string> = {
  NEW_CONTRACT:         'bg-blue-50 text-blue-700',
  MARKETING_TO_BUYERS:  'bg-purple-50 text-purple-700',
  SHOWING_TO_BUYERS:    'bg-yellow-50 text-yellow-700',
  EVALUATING_OFFERS:    'bg-orange-50 text-orange-700',
  ACCEPTED_OFFER:       'bg-emerald-50 text-emerald-700',
  CLEAR_TO_CLOSE:       'bg-green-100 text-green-800',
}

const INV_STAGE_LABELS: Record<string, string> = {
  NEW_INVENTORY:      'New',
  GETTING_ESTIMATES:  'Getting Estimates',
  UNDER_REHAB:        'Under Rehab',
  LISTED_FOR_SALE:    'Listed',
  UNDER_CONTRACT:     'Under Contract',
}

const INV_STAGE_COLORS: Record<string, string> = {
  NEW_INVENTORY:      'bg-gray-100 text-gray-700',
  GETTING_ESTIMATES:  'bg-yellow-50 text-yellow-700',
  UNDER_REHAB:        'bg-orange-50 text-orange-700',
  LISTED_FOR_SALE:    'bg-blue-50 text-blue-700',
  UNDER_CONTRACT:     'bg-green-100 text-green-800',
}

export function PipelineTable({ rows, total, basePath, page, pageSize, stageLabel, extraColumns = [] }: Props) {
  const router = useRouter()

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No properties in this pipeline</p>
      </div>
    )
  }

  function renderStage(row: PipelineRow) {
    const stage = row.tmStage ?? row.inventoryStage
    if (!stage) return <span className="text-gray-300">—</span>

    const isTm = !!row.tmStage
    const labels = isTm ? TM_STAGE_LABELS : INV_STAGE_LABELS
    const colors = isTm ? TM_STAGE_COLORS : INV_STAGE_COLORS

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${colors[stage] ?? 'bg-gray-100 text-gray-700'}`}>
        {labels[stage] ?? stage}
      </span>
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
            <th className="text-left px-4 py-2.5">Stage</th>
            <th className="text-left px-4 py-2.5">Assigned</th>
            {extraColumns.map((c) => (
              <th key={c.header} className="text-left px-4 py-2.5">{c.header}</th>
            ))}
            <th className="text-left px-4 py-2.5">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const primary = row.contacts[0]?.contact
            return (
              <tr
                key={row.id}
                onClick={() => router.push(`${basePath}/${row.id}`)}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {row.isHot && <span>🔥</span>}
                    <div>
                      <p className="font-medium text-gray-900">{row.streetAddress ?? '—'}</p>
                      <p className="text-[11px] text-gray-400">{[row.city, row.state].filter(Boolean).join(', ')}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {primary ? (
                    <div>
                      <p className="text-gray-800">{[primary.firstName, primary.lastName].filter(Boolean).join(' ')}</p>
                      <p className="text-[11px] text-gray-400">{primary.phone ?? '—'}</p>
                    </div>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">{renderStage(row)}</td>
                <td className="px-4 py-3 text-gray-600">{row.assignedTo?.name ?? <span className="text-gray-300">—</span>}</td>
                {extraColumns.map((c) => (
                  <td key={c.header} className="px-4 py-3">{c.render(row)}</td>
                ))}
                <td className="px-4 py-3 text-[11px] text-gray-400">
                  {formatDistanceToNow(new Date(row.updatedAt), { addSuffix: true })}
                </td>
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

- [ ] **Step 4: Update `warm/page.tsx`**

Replace entire file:

```tsx
import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getLeadList } from '@/lib/leads'
import { prisma } from '@/lib/prisma'
import { LeadTable } from '@/components/leads/LeadTable'
import { LeadFilters } from '@/components/leads/LeadFilters'

interface PageProps {
  searchParams: Promise<{ search?: string; assignedToId?: string; page?: string }>
}

export default async function LeadsWarmPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const [{ rows, total, page, pageSize }, users] = await Promise.all([
    getLeadList({
      pipeline: 'warm',
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
      <h1 className="text-xl font-bold text-gray-900">Warm Leads</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Follow-up later pipeline</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} showStageFilter={false} />
      </Suspense>
      <LeadTable rows={rows as any} total={total} pipeline="warm" page={page} pageSize={pageSize} />
    </div>
  )
}
```

- [ ] **Step 5: Update `dead/page.tsx`**

```tsx
import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getLeadList } from '@/lib/leads'
import { prisma } from '@/lib/prisma'
import { LeadTable } from '@/components/leads/LeadTable'
import { LeadFilters } from '@/components/leads/LeadFilters'

interface PageProps {
  searchParams: Promise<{ search?: string; assignedToId?: string; page?: string }>
}

export default async function LeadsDeadPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const [{ rows, total, page, pageSize }, users] = await Promise.all([
    getLeadList({
      pipeline: 'dead',
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
      <h1 className="text-xl font-bold text-gray-900">Dead Leads</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Removed from active pipeline</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} showStageFilter={false} />
      </Suspense>
      <LeadTable rows={rows as any} total={total} pipeline="dead" page={page} pageSize={pageSize} />
    </div>
  )
}
```

- [ ] **Step 6: Update `referred/page.tsx`**

```tsx
import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getLeadList } from '@/lib/leads'
import { prisma } from '@/lib/prisma'
import { LeadTable } from '@/components/leads/LeadTable'
import { LeadFilters } from '@/components/leads/LeadFilters'

interface PageProps {
  searchParams: Promise<{ search?: string; assignedToId?: string; page?: string }>
}

export default async function LeadsReferredPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const [{ rows, total, page, pageSize }, users] = await Promise.all([
    getLeadList({
      pipeline: 'referred',
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
      <h1 className="text-xl font-bold text-gray-900">Referred to Agent</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">DTS leads forwarded to agents</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} showStageFilter={false} />
      </Suspense>
      <LeadTable rows={rows as any} total={total} pipeline="referred" page={page} pageSize={pageSize} />
    </div>
  )
}
```

- [ ] **Step 7: Update `tm/page.tsx`**

In `apps/web/src/app/(app)/tm/page.tsx` change:
1. Destructure `{ rows, total, page, pageSize }` instead of `{ rows, total }` from `getTmList`
2. Add `page={page} pageSize={pageSize}` to `<PipelineTable>`

```tsx
import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getTmList } from '@/lib/pipelines'
import { prisma } from '@/lib/prisma'
import { PipelineTable } from '@/components/pipelines/PipelineTable'
import { LeadFilters } from '@/components/leads/LeadFilters'

interface PageProps {
  searchParams: Promise<{ search?: string; assignedToId?: string; page?: string }>
}

export default async function TmPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const [{ rows, total, page, pageSize }, users] = await Promise.all([
    getTmList({
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
      <h1 className="text-xl font-bold text-gray-900">Transaction Management</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Properties under contract through closing</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} showStageFilter={false} />
      </Suspense>
      <PipelineTable rows={rows as any} total={total} basePath="/tm" page={page} pageSize={pageSize} />
    </div>
  )
}
```

- [ ] **Step 8: Update `inventory/page.tsx`**

```tsx
import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getInventoryList } from '@/lib/pipelines'
import { prisma } from '@/lib/prisma'
import { PipelineTable } from '@/components/pipelines/PipelineTable'
import { LeadFilters } from '@/components/leads/LeadFilters'

interface PageProps {
  searchParams: Promise<{ search?: string; assignedToId?: string; page?: string }>
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const [{ rows, total, page, pageSize }, users] = await Promise.all([
    getInventoryList({
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
      <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Properties being rehabbed or listed</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} showStageFilter={false} />
      </Suspense>
      <PipelineTable rows={rows as any} total={total} basePath="/inventory" page={page} pageSize={pageSize} />
    </div>
  )
}
```

- [ ] **Step 9: Update `dispo/page.tsx`**

```tsx
import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getDispoList } from '@/lib/pipelines'
import { prisma } from '@/lib/prisma'
import { PipelineTable } from '@/components/pipelines/PipelineTable'
import { LeadFilters } from '@/components/leads/LeadFilters'

interface PageProps {
  searchParams: Promise<{ search?: string; assignedToId?: string; page?: string }>
}

export default async function DispoPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const [{ rows, total, page, pageSize }, users] = await Promise.all([
    getDispoList({
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
      <h1 className="text-xl font-bold text-gray-900">Dispo</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Properties available for buyers</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} showStageFilter={false} />
      </Suspense>
      <PipelineTable
        rows={rows as any}
        total={total}
        basePath="/dispo"
        page={page}
        pageSize={pageSize}
        extraColumns={[
          {
            header: 'Offers',
            render: (row: any) => (
              row._count?.offers > 0
                ? <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium">{row._count.offers} offer{row._count.offers !== 1 ? 's' : ''}</span>
                : <span className="text-gray-300">—</span>
            ),
          },
          {
            header: 'Buyers',
            render: (row: any) => (
              row._count?.buyerMatches > 0
                ? <span className="text-[11px] text-gray-600">{row._count.buyerMatches} matched</span>
                : <span className="text-gray-300">—</span>
            ),
          },
        ]}
      />
    </div>
  )
}
```

- [ ] **Step 10: TypeScript check**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: no output (zero errors)

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/components/ui/Pagination.tsx \
        apps/web/src/components/leads/LeadTable.tsx \
        apps/web/src/components/pipelines/PipelineTable.tsx \
        apps/web/src/app/\(app\)/leads/warm/page.tsx \
        apps/web/src/app/\(app\)/leads/dead/page.tsx \
        apps/web/src/app/\(app\)/leads/referred/page.tsx \
        apps/web/src/app/\(app\)/tm/page.tsx \
        apps/web/src/app/\(app\)/inventory/page.tsx \
        apps/web/src/app/\(app\)/dispo/page.tsx
git commit -m "feat: add paginated list tables across all 8 pipeline views"
```

---

### Task 4: Hot filter button in LeadFilters + wire DTS/DTA

**Files:**
- Modify: `apps/web/src/components/leads/LeadFilters.tsx`

- [ ] **Step 1: Update `LeadFilters.tsx`**

Replace the full file:

```tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'

const STAGE_OPTIONS = [
  { value: '', label: 'All Stages' },
  { value: 'NEW_LEAD', label: 'New Lead' },
  { value: 'DISCOVERY', label: 'Discovery' },
  { value: 'INTERESTED_ADD_TO_FOLLOW_UP', label: 'Follow Up' },
  { value: 'APPOINTMENT_MADE', label: 'Appointment' },
  { value: 'DUE_DILIGENCE', label: 'Due Diligence' },
  { value: 'OFFER_MADE', label: 'Offer Made' },
  { value: 'OFFER_FOLLOW_UP', label: 'Offer Follow Up' },
  { value: 'UNDER_CONTRACT', label: 'Under Contract' },
]

interface Props {
  users: Array<{ id: string; name: string }>
  showStageFilter?: boolean
  showHotFilter?: boolean
}

export function LeadFilters({ users, showStageFilter = true, showHotFilter = false }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page')
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`)
      })
    },
    [pathname, router, searchParams]
  )

  const isHotActive = searchParams.get('isHot') === '1'

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <input
        placeholder="Search address or contact..."
        defaultValue={searchParams.get('search') ?? ''}
        onChange={(e) => {
          const val = e.target.value
          clearTimeout((window as any)._searchDebounce)
          ;(window as any)._searchDebounce = setTimeout(() => updateParam('search', val), 300)
        }}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm h-8 max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {showStageFilter && (
        <select
          defaultValue={searchParams.get('stage') ?? ''}
          onChange={(e) => updateParam('stage', e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm h-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STAGE_OPTIONS.map((o) => (
            <option key={o.value || '__all'} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      <select
        defaultValue={searchParams.get('assignedToId') ?? ''}
        onChange={(e) => updateParam('assignedToId', e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm h-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All Users</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>

      {showHotFilter && (
        <button
          onClick={() => updateParam('isHot', isHotActive ? '' : '1')}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm h-8 rounded-lg border transition-colors ${
            isHotActive
              ? 'bg-amber-50 border-amber-300 text-amber-700 font-medium'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          🔥 Hot Only
        </button>
      )}
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
git add apps/web/src/components/leads/LeadFilters.tsx
git commit -m "feat: add hot-only quick filter toggle to lead list views"
```

---

### Task 5: ActivityCard + wire all 5 detail pages

**Files:**
- Create: `apps/web/src/components/leads/ActivityCard.tsx`
- Modify: `apps/web/src/app/(app)/leads/dts/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/dta/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/tm/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/inventory/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/dispo/[id]/page.tsx`

- [ ] **Step 1: Create `ActivityCard.tsx`**

This is a server component — no `'use client'` needed.

```tsx
import { format } from 'date-fns'

const ACTION_LABELS: Record<string, string> = {
  LEAD_CREATED: 'Lead Created',
  STAGE_CHANGED: 'Stage Changed',
  STATUS_CHANGED: 'Status Changed',
  NOTE_ADDED: 'Note Added',
  TASK_CREATED: 'Task Created',
  TASK_COMPLETED: 'Task Completed',
  AI_SUMMARY_GENERATED: 'AI Summary Generated',
  HOT_LEAD_SCORED: 'Hot Lead Scored',
  CONTACT_ADDED: 'Contact Added',
  CONTACT_REMOVED: 'Contact Removed',
  PROPERTY_PROMOTED: 'Property Promoted',
  OFFER_RECEIVED: 'Offer Received',
}

interface ActivityLog {
  id: string
  action: string
  detail: unknown
  createdAt: Date
  user: { id: string; name: string } | null
}

interface StageRecord {
  id: string
  pipeline: string
  toStage: string
  changedByName: string
  createdAt: Date
}

interface Props {
  activityLogs: ActivityLog[]
  stageHistory: StageRecord[]
}

type FeedItem = {
  id: string
  createdAt: Date
  label: string
  subtext: string
  dot: 'blue' | 'gray'
}

function formatStageName(stage: string): string {
  return stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ActivityCard({ activityLogs, stageHistory }: Props) {
  const items: FeedItem[] = [
    ...activityLogs.map((log) => ({
      id: `act-${log.id}`,
      createdAt: new Date(log.createdAt),
      label: ACTION_LABELS[log.action] ?? log.action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
      subtext: [
        (log.detail as any)?.description ?? '',
        log.user?.name ? `by ${log.user.name}` : '',
      ].filter(Boolean).join(' · '),
      dot: 'blue' as const,
    })),
    ...stageHistory.map((sh) => ({
      id: `stage-${sh.id}`,
      createdAt: new Date(sh.createdAt),
      label: `Moved to ${formatStageName(sh.toStage)}`,
      subtext: `${sh.pipeline} · by ${sh.changedByName}`,
      dot: 'gray' as const,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">
        Activity <span className="text-gray-400 font-normal">({items.length})</span>
      </h3>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No activity yet</p>
      ) : (
        <div className="relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-100" />
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex gap-3 relative">
                <div className={`w-3.5 h-3.5 rounded-full border-2 mt-0.5 flex-shrink-0 ${
                  item.dot === 'blue'
                    ? 'bg-blue-500 border-blue-500'
                    : 'bg-white border-gray-300'
                }`} />
                <div className="flex-1 min-w-0 pb-0.5">
                  <p className="text-sm text-gray-800 font-medium">{item.label}</p>
                  {item.subtext && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{item.subtext}</p>
                  )}
                  <p className="text-[11px] text-gray-300 mt-0.5">
                    {format(item.createdAt, 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add ActivityCard to `leads/dts/[id]/page.tsx`**

Add import at the top:
```typescript
import { ActivityCard } from '@/components/leads/ActivityCard'
```

In the right column `<div className="space-y-4">`, add after `<PropertyChatPanel>`:
```tsx
<ActivityCard
  activityLogs={lead.activityLogs as any}
  stageHistory={lead.stageHistory as any}
/>
```

- [ ] **Step 3: Add ActivityCard to `leads/dta/[id]/page.tsx`**

Same import and same addition in the right column after `<PropertyChatPanel>`:
```tsx
import { ActivityCard } from '@/components/leads/ActivityCard'
```
```tsx
<ActivityCard
  activityLogs={lead.activityLogs as any}
  stageHistory={lead.stageHistory as any}
/>
```

- [ ] **Step 4: Add ActivityCard to `tm/[id]/page.tsx`**

Add import:
```typescript
import { ActivityCard } from '@/components/leads/ActivityCard'
```

In `tm/[id]/page.tsx`, in the `col-span-2` left column, add after `<NotesCard>`:
```tsx
<ActivityCard
  activityLogs={property.activityLogs as any}
  stageHistory={property.stageHistory as any}
/>
```

- [ ] **Step 5: Add ActivityCard to `inventory/[id]/page.tsx`**

Same pattern — import + add after `<NotesCard>`:
```typescript
import { ActivityCard } from '@/components/leads/ActivityCard'
```
```tsx
<ActivityCard
  activityLogs={property.activityLogs as any}
  stageHistory={property.stageHistory as any}
/>
```

- [ ] **Step 6: Add ActivityCard to `dispo/[id]/page.tsx`**

Same pattern — import + add after `<NotesCard>`:
```typescript
import { ActivityCard } from '@/components/leads/ActivityCard'
```
```tsx
<ActivityCard
  activityLogs={property.activityLogs as any}
  stageHistory={property.stageHistory as any}
/>
```

- [ ] **Step 7: TypeScript check**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: no output (zero errors)

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/leads/ActivityCard.tsx \
        "apps/web/src/app/(app)/leads/dts/[id]/page.tsx" \
        "apps/web/src/app/(app)/leads/dta/[id]/page.tsx" \
        "apps/web/src/app/(app)/tm/[id]/page.tsx" \
        "apps/web/src/app/(app)/inventory/[id]/page.tsx" \
        "apps/web/src/app/(app)/dispo/[id]/page.tsx"
git commit -m "feat: add activity feed timeline to all 5 pipeline detail pages"
```

---

### Task 6: Build verification

**Files:** None

- [ ] **Step 1: Run full test suite**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run 2>&1 | tail -6
```

Expected: `62 passed (17 files)`

- [ ] **Step 2: TypeScript check**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: no output (zero errors)

- [ ] **Step 3: Production build**

```
cd apps/web && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd next build 2>&1 | tail -35
```

Expected: all pipeline list and detail routes show `ƒ (Dynamic)`, no build errors.

---

## Self-Review

**Spec coverage:**
- ✅ New Lead creation modal — DTS and DTA pipelines can create leads from the UI
- ✅ Pagination — all 8 list views (DTS, DTA, Warm, Dead, Referred, TM, Inventory, Dispo) paginate at 50 records/page
- ✅ Activity feed — all 5 detail pages (DTS, DTA, TM, Inventory, Dispo) show stage history + activity logs
- ✅ Hot filter — DTS/DTA list views have 🔥 Hot Only toggle

**Placeholder scan:** None — all steps include complete code.

**Type consistency:**
- `FeedItem` defined once in `ActivityCard.tsx`, used only there — no cross-task type sharing issues
- `Market` interface defined in `NewLeadModal.tsx` and `NewLeadButton.tsx` — identical shape `{ id: string; name: string }` both times (safe duplicate, different files)
- `Pagination` props (`page`, `pageSize`, `total`) match what's passed in `LeadTable`/`PipelineTable` — verified against `getLeadList` return type `{ rows, total, page, pageSize }`
