# Phase 4 — Buyers, Vendors, Sold Archive, Rental Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Buyers management module (buyer list + detail with criteria/matches/offers), Vendors management module (vendor list + detail), and the Sold/Rental archive views.

**Architecture:** Same Server Component + Route Handler pattern as Phases 2–3B. Server Components query Prisma for all list/detail reads. URL search params carry filter state. Route Handlers handle all mutations (create buyer, update criteria, create vendor). Sold and Rental are read-only archive views — they are filtered property lists that link back to existing lead detail pages.

**Tech Stack:** Next.js 15 App Router, Prisma 7 (`@crm/database`), Zod, Tailwind CSS 4, Vitest, `date-fns`

---

## Actual Schema Field Names (MEMORIZE THESE — do not assume)

```
Buyer:
  id, contactId, isActive: Boolean, preferredMarkets: String[], notes: String?,
  createdAt, updatedAt
  contact: Contact, criteria: BuyerCriteria[], matches: BuyerMatch[], offers: BuyerOffer[]

BuyerCriteria:
  id, buyerId, markets: String[], propertyTypes: String[],
  minBeds: Int?, maxBeds: Int?, minBaths: Decimal?, maxBaths: Decimal?,
  minPrice: Decimal?, maxPrice: Decimal?,
  minSqft: Int?, maxSqft: Int?,
  minArv: Decimal?, maxArv: Decimal?, maxRepairs: Decimal?,
  notes: String?, createdAt, updatedAt

BuyerMatch:
  id, buyerId, propertyId, score: Int, notified: Boolean, createdAt
  @@unique([buyerId, propertyId])

BuyerOffer:
  id, propertyId, buyerId, offerAmount: Decimal, status: String,
  notes: String?, submittedAt: DateTime, respondedAt: DateTime?, updatedAt

Vendor:
  id, contactId, isActive: Boolean, category: String, markets: String[],
  notes: String?, createdAt, updatedAt
  contact: Contact

Contact:
  id, type: ContactType, firstName: String, lastName: String?,
  email: String?, phone: String?, phone2: String?,
  address: String?, city: String?, state: String?, zip: String?,
  notes: String?, tags: String[]

Property (archive fields):
  propertyStatus: PropertyStatus (SOLD | RENTAL | ...)
  soldAt: DateTime?, contractDate: DateTime?,
  offerPrice: Decimal?, askingPrice: Decimal?, arv: Decimal?,
  exitStrategy: ExitStrategy?, leadType: LeadType,
  streetAddress, city, state, zip,
  assignedTo: User?

Note: body (NOT content), authorId, authorName
Task: dueAt (NOT dueDate), description (NOT notes)
ActivityLog: detail: Json (NOT description: String)
```

---

## File Map

```
NEW — lib & tests:
  apps/web/src/lib/archive.ts                             ← getSoldList, getRentalList
  apps/web/src/lib/buyers.ts                              ← getBuyerList, getBuyerById
  apps/web/src/lib/vendors.ts                             ← getVendorList, getVendorById
  apps/web/src/lib/__tests__/archive.test.ts
  apps/web/src/lib/__tests__/buyers.test.ts
  apps/web/src/lib/__tests__/vendors.test.ts

NEW — Route Handlers:
  apps/web/src/app/api/buyers/route.ts                    ← POST: create buyer + contact
  apps/web/src/app/api/buyers/[id]/route.ts               ← PATCH: update buyer, DELETE: deactivate
  apps/web/src/app/api/buyers/[id]/criteria/route.ts      ← POST: add criteria, DELETE: remove criteria

  apps/web/src/app/api/vendors/route.ts                   ← POST: create vendor + contact
  apps/web/src/app/api/vendors/[id]/route.ts              ← PATCH: update vendor, DELETE: deactivate

NEW — Buyer Components:
  apps/web/src/components/buyers/BuyerTable.tsx           ← client list table
  apps/web/src/components/buyers/AddBuyerModal.tsx        ← create buyer form modal
  apps/web/src/components/buyers/BuyerCriteriaCard.tsx    ← criteria display + add form
  apps/web/src/components/buyers/BuyerMatchHistoryCard.tsx ← matched properties list
  apps/web/src/components/buyers/BuyerOfferHistoryCard.tsx ← offer history

NEW — Vendor Components:
  apps/web/src/components/vendors/VendorTable.tsx         ← client list table
  apps/web/src/components/vendors/AddVendorModal.tsx      ← create vendor form modal

NEW — Archive Components:
  apps/web/src/components/archive/ArchiveTable.tsx        ← reusable sold/rental table

NEW — Pages (replacing ComingSoon stubs):
  apps/web/src/app/(app)/sold/page.tsx                    ← Sold archive list
  apps/web/src/app/(app)/rental/page.tsx                  ← Rental archive list
  apps/web/src/app/(app)/buyers/page.tsx                  ← Buyer list
  apps/web/src/app/(app)/buyers/[id]/page.tsx             ← Buyer detail
  apps/web/src/app/(app)/vendors/page.tsx                 ← Vendor list
  apps/web/src/app/(app)/vendors/[id]/page.tsx            ← Vendor detail
```

---

### Task 1: Archive Query Helpers (Sold & Rental)

**Files:**
- Create: `apps/web/src/lib/archive.ts`
- Create: `apps/web/src/lib/__tests__/archive.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/__tests__/archive.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    property: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getSoldList, getRentalList } from '@/lib/archive'

describe('getSoldList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by propertyStatus SOLD', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getSoldList({})

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyStatus: 'SOLD' }),
      })
    )
  })

  it('returns rows and total', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([{ id: '1' }])
    ;(prisma.property.count as any).mockResolvedValue(1)

    const result = await getSoldList({})

    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('orders by soldAt desc', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getSoldList({})

    const call = (prisma.property.findMany as any).mock.calls[0][0]
    expect(call.orderBy).toEqual({ soldAt: 'desc' })
  })
})

describe('getRentalList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by propertyStatus RENTAL', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getRentalList({})

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyStatus: 'RENTAL' }),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/archive.test.ts 2>&1 | tail -15
```
Expected: FAIL — functions not found

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/archive.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export interface ArchiveFilter {
  search?: string
  assignedToId?: string
  page?: number
  pageSize?: number
}

const ARCHIVE_LIST_INCLUDE = {
  contacts: {
    where: { isPrimary: true },
    include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
    take: 1,
  },
  assignedTo: { select: { id: true, name: true } },
} satisfies Prisma.PropertyInclude

function buildSearchOr(search: string): Prisma.PropertyWhereInput['OR'] {
  return [
    { normalizedAddress: { contains: search, mode: 'insensitive' } },
    { streetAddress: { contains: search, mode: 'insensitive' } },
    { city: { contains: search, mode: 'insensitive' } },
  ]
}

export async function getSoldList(filter: ArchiveFilter) {
  const { search, assignedToId, page = 1, pageSize = 50 } = filter

  const where: Prisma.PropertyWhereInput = {
    propertyStatus: 'SOLD',
    ...(assignedToId && { assignedToId }),
    ...(search && { OR: buildSearchOr(search) }),
  }

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: ARCHIVE_LIST_INCLUDE,
      orderBy: { soldAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function getRentalList(filter: ArchiveFilter) {
  const { search, assignedToId, page = 1, pageSize = 50 } = filter

  const where: Prisma.PropertyWhereInput = {
    propertyStatus: 'RENTAL',
    ...(assignedToId && { assignedToId }),
    ...(search && { OR: buildSearchOr(search) }),
  }

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: ARCHIVE_LIST_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
  ])

  return { rows, total, page, pageSize }
}
```

- [ ] **Step 4: Run tests — confirm PASS**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/archive.test.ts 2>&1 | tail -10
```
Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/lib/archive.ts apps/web/src/lib/__tests__/archive.test.ts
git commit -m "feat: add sold and rental archive query helpers with tests"
```

---

### Task 2: Sold & Rental Archive Pages

**Files:**
- Create: `apps/web/src/components/archive/ArchiveTable.tsx`
- Modify: `apps/web/src/app/(app)/sold/page.tsx`
- Modify: `apps/web/src/app/(app)/rental/page.tsx`

- [ ] **Step 1: Create ArchiveTable component**

Create `apps/web/src/components/archive/ArchiveTable.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

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
}

const EXIT_STRATEGY_LABELS: Record<string, string> = {
  WHOLESALE:         'Wholesale',
  SELLER_FINANCE:    'Seller Finance',
  INSTALLMENT:       'Installment',
  FIX_AND_FLIP:      'Fix & Flip',
  INVENTORY_LATER:   'Inventory',
  RENTAL:            'Rental',
  TURNKEY:           'Turnkey',
}

export function ArchiveTable({ rows, total, type }: Props) {
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
            {type === 'sold' && <th className="text-left px-4 py-2.5">Sold Price</th>}
            {type === 'sold' && <th className="text-left px-4 py-2.5">Sold Date</th>}
            <th className="text-left px-4 py-2.5">Assigned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const primary = row.contacts[0]?.contact
            const pipeline = row.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
            return (
              <tr
                key={row.id}
                onClick={() => router.push(`/leads/${pipeline}/${row.id}`)}
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
    </div>
  )
}
```

- [ ] **Step 2: Write Sold page**

Replace `apps/web/src/app/(app)/sold/page.tsx`:

```typescript
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
  const [{ rows, total }, users] = await Promise.all([
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
      <ArchiveTable rows={rows as any} total={total} type="sold" />
    </div>
  )
}
```

- [ ] **Step 3: Write Rental page**

Replace `apps/web/src/app/(app)/rental/page.tsx`:

```typescript
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
  const [{ rows, total }, users] = await Promise.all([
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
      <ArchiveTable rows={rows as any} total={total} type="rental" />
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | grep "error TS" | head -20
```
Fix any errors in files you just wrote.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/components/archive/ "apps/web/src/app/(app)/sold/" "apps/web/src/app/(app)/rental/"
git commit -m "feat: implement Sold and Rental archive pages"
```

---

### Task 3: Buyer Query Helpers + Tests

**Files:**
- Create: `apps/web/src/lib/buyers.ts`
- Create: `apps/web/src/lib/__tests__/buyers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/__tests__/buyers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    buyer: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getBuyerList, getBuyerById } from '@/lib/buyers'

describe('getBuyerList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns rows and total', async () => {
    ;(prisma.buyer.findMany as any).mockResolvedValue([{ id: 'b1' }])
    ;(prisma.buyer.count as any).mockResolvedValue(1)

    const result = await getBuyerList({})

    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('includes contact info', async () => {
    ;(prisma.buyer.findMany as any).mockResolvedValue([])
    ;(prisma.buyer.count as any).mockResolvedValue(0)

    await getBuyerList({})

    const call = (prisma.buyer.findMany as any).mock.calls[0][0]
    expect(call.include?.contact).toBeDefined()
  })

  it('filters by isActive when activeOnly is true', async () => {
    ;(prisma.buyer.findMany as any).mockResolvedValue([])
    ;(prisma.buyer.count as any).mockResolvedValue(0)

    await getBuyerList({ activeOnly: true })

    expect(prisma.buyer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      })
    )
  })
})

describe('getBuyerById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches buyer with criteria, matches, and offers', async () => {
    ;(prisma.buyer.findUnique as any).mockResolvedValue(null)

    await getBuyerById('buyer-1')

    expect(prisma.buyer.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'buyer-1' },
        include: expect.objectContaining({
          contact: expect.anything(),
          criteria: expect.anything(),
          matches: expect.anything(),
          offers: expect.anything(),
        }),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/buyers.test.ts 2>&1 | tail -15
```
Expected: FAIL

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/buyers.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export interface BuyerListFilter {
  search?: string
  activeOnly?: boolean
  page?: number
  pageSize?: number
}

const BUYER_LIST_INCLUDE = {
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
    },
  },
  _count: {
    select: {
      criteria: true,
      matches: true,
      offers: true,
    },
  },
} satisfies Prisma.BuyerInclude

export async function getBuyerList(filter: BuyerListFilter) {
  const { search, activeOnly, page = 1, pageSize = 50 } = filter

  const where: Prisma.BuyerWhereInput = {
    ...(activeOnly && { isActive: true }),
    ...(search && {
      contact: {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      },
    }),
  }

  const [rows, total] = await Promise.all([
    prisma.buyer.findMany({
      where,
      include: BUYER_LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.buyer.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function getBuyerById(id: string) {
  return prisma.buyer.findUnique({
    where: { id },
    include: {
      contact: true,
      criteria: { orderBy: { createdAt: 'desc' } },
      matches: {
        include: {
          property: {
            select: {
              id: true,
              streetAddress: true,
              city: true,
              state: true,
              propertyStatus: true,
              leadType: true,
            },
          },
        },
        orderBy: { score: 'desc' },
        take: 50,
      },
      offers: {
        include: {
          property: {
            select: {
              id: true,
              streetAddress: true,
              city: true,
              state: true,
              leadType: true,
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
        take: 50,
      },
    },
  })
}
```

- [ ] **Step 4: Run tests — confirm PASS**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/buyers.test.ts 2>&1 | tail -10
```
Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/lib/buyers.ts apps/web/src/lib/__tests__/buyers.test.ts
git commit -m "feat: add buyer query helpers with tests"
```

---

### Task 4: Vendor Query Helpers + Tests

**Files:**
- Create: `apps/web/src/lib/vendors.ts`
- Create: `apps/web/src/lib/__tests__/vendors.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/__tests__/vendors.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    vendor: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getVendorList, getVendorById } from '@/lib/vendors'

describe('getVendorList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns rows and total', async () => {
    ;(prisma.vendor.findMany as any).mockResolvedValue([{ id: 'v1' }])
    ;(prisma.vendor.count as any).mockResolvedValue(1)

    const result = await getVendorList({})

    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('includes contact info', async () => {
    ;(prisma.vendor.findMany as any).mockResolvedValue([])
    ;(prisma.vendor.count as any).mockResolvedValue(0)

    await getVendorList({})

    const call = (prisma.vendor.findMany as any).mock.calls[0][0]
    expect(call.include?.contact).toBeDefined()
  })

  it('filters by category', async () => {
    ;(prisma.vendor.findMany as any).mockResolvedValue([])
    ;(prisma.vendor.count as any).mockResolvedValue(0)

    await getVendorList({ category: 'PLUMBER' })

    expect(prisma.vendor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: 'PLUMBER' }),
      })
    )
  })
})

describe('getVendorById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches vendor with full contact info', async () => {
    ;(prisma.vendor.findUnique as any).mockResolvedValue(null)

    await getVendorById('vendor-1')

    expect(prisma.vendor.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vendor-1' },
        include: expect.objectContaining({ contact: expect.anything() }),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/vendors.test.ts 2>&1 | tail -15
```

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/vendors.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export interface VendorListFilter {
  search?: string
  category?: string
  activeOnly?: boolean
  page?: number
  pageSize?: number
}

export async function getVendorList(filter: VendorListFilter) {
  const { search, category, activeOnly, page = 1, pageSize = 50 } = filter

  const where: Prisma.VendorWhereInput = {
    ...(activeOnly && { isActive: true }),
    ...(category && { category }),
    ...(search && {
      contact: {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      },
    }),
  }

  const [rows, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.vendor.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function getVendorById(id: string) {
  return prisma.vendor.findUnique({
    where: { id },
    include: {
      contact: true,
    },
  })
}
```

- [ ] **Step 4: Run tests — confirm PASS**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/vendors.test.ts 2>&1 | tail -10
```
Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/lib/vendors.ts apps/web/src/lib/__tests__/vendors.test.ts
git commit -m "feat: add vendor query helpers with tests"
```

---

### Task 5: Buyer & Vendor Route Handlers

**Files:**
- Create: `apps/web/src/app/api/buyers/route.ts`
- Create: `apps/web/src/app/api/buyers/[id]/route.ts`
- Create: `apps/web/src/app/api/buyers/[id]/criteria/route.ts`
- Create: `apps/web/src/app/api/vendors/route.ts`
- Create: `apps/web/src/app/api/vendors/[id]/route.ts`

- [ ] **Step 1: Write buyer route handler (create)**

Create `apps/web/src/app/api/buyers/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CreateBuyerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
  preferredMarkets: z.array(z.string()).default([]),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateBuyerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { firstName, lastName, email, phone, notes, preferredMarkets } = parsed.data

  const buyer = await prisma.buyer.create({
    data: {
      preferredMarkets,
      notes,
      contact: {
        create: {
          type: 'BUYER',
          firstName,
          lastName,
          email,
          phone,
        },
      },
    },
    include: {
      contact: true,
    },
  })

  return NextResponse.json({ success: true, data: buyer }, { status: 201 })
}
```

- [ ] **Step 2: Write buyer [id] route handler (update + deactivate)**

Create `apps/web/src/app/api/buyers/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const UpdateBuyerSchema = z.object({
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  preferredMarkets: z.array(z.string()).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateBuyerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const buyer = await prisma.buyer.update({
    where: { id },
    data: parsed.data,
    include: { contact: { select: { firstName: true, lastName: true } } },
  })

  return NextResponse.json({ success: true, data: buyer })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  // Soft-deactivate rather than hard delete (preserves offer/match history)
  await prisma.buyer.update({
    where: { id },
    data: { isActive: false },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Write buyer criteria route handler**

Create `apps/web/src/app/api/buyers/[id]/criteria/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CreateCriteriaSchema = z.object({
  markets: z.array(z.string()).default([]),
  propertyTypes: z.array(z.string()).default([]),
  minBeds: z.number().int().min(0).optional(),
  maxBeds: z.number().int().min(0).optional(),
  minBaths: z.number().min(0).optional(),
  maxBaths: z.number().min(0).optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  minSqft: z.number().int().min(0).optional(),
  maxSqft: z.number().int().min(0).optional(),
  minArv: z.number().min(0).optional(),
  maxArv: z.number().min(0).optional(),
  maxRepairs: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
})

const DeleteCriteriaSchema = z.object({
  criteriaId: z.string().min(1),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = CreateCriteriaSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const criteria = await prisma.buyerCriteria.create({
    data: {
      buyerId: id,
      ...parsed.data,
    },
  })

  return NextResponse.json({ success: true, data: criteria }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await params // must await even if unused for id, criteria deletion uses criteriaId from body
  const body = await req.json()
  const parsed = DeleteCriteriaSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  await prisma.buyerCriteria.delete({ where: { id: parsed.data.criteriaId } })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Write vendor route handlers**

Create `apps/web/src/app/api/vendors/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CreateVendorSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  category: z.string().min(1).max(100),
  markets: z.array(z.string()).default([]),
  notes: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateVendorSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { firstName, lastName, email, phone, category, markets, notes } = parsed.data

  const vendor = await prisma.vendor.create({
    data: {
      category,
      markets,
      notes,
      contact: {
        create: {
          type: 'SELLER', // use SELLER as generic external party type; ContactType enum may not have VENDOR
          firstName,
          lastName,
          email,
          phone,
        },
      },
    },
    include: { contact: true },
  })

  return NextResponse.json({ success: true, data: vendor }, { status: 201 })
}
```

**IMPORTANT:** Before writing the `contact.create` block, check the ContactType enum:
```bash
PATH=/c/node-x64:$PATH grep -A 10 "^enum ContactType" "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/packages/database/prisma/schema.prisma"
```
Use the correct enum value. If `VENDOR` exists, use it. If only `BUYER` and `SELLER` exist, use `SELLER` for vendors.

Create `apps/web/src/app/api/vendors/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const UpdateVendorSchema = z.object({
  isActive: z.boolean().optional(),
  category: z.string().min(1).max(100).optional(),
  markets: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateVendorSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const vendor = await prisma.vendor.update({
    where: { id },
    data: parsed.data,
    include: { contact: { select: { firstName: true, lastName: true } } },
  })

  return NextResponse.json({ success: true, data: vendor })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.vendor.update({
    where: { id },
    data: { isActive: false },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | grep "error TS" | head -20
```
Fix any errors in files you just wrote. Common issue: ContactType enum value — check schema and correct.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/app/api/buyers/ apps/web/src/app/api/vendors/
git commit -m "feat: add buyer and vendor route handlers (create, update, criteria)"
```

---

### Task 6: Buyer UI Components

**Files:**
- Create: `apps/web/src/components/buyers/BuyerTable.tsx`
- Create: `apps/web/src/components/buyers/AddBuyerModal.tsx`
- Create: `apps/web/src/components/buyers/BuyerCriteriaCard.tsx`
- Create: `apps/web/src/components/buyers/BuyerMatchHistoryCard.tsx`
- Create: `apps/web/src/components/buyers/BuyerOfferHistoryCard.tsx`

- [ ] **Step 1: Write BuyerTable**

Create `apps/web/src/components/buyers/BuyerTable.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { UserCheck, UserX } from 'lucide-react'

interface BuyerRow {
  id: string
  isActive: boolean
  preferredMarkets: string[]
  createdAt: Date
  contact: {
    firstName: string
    lastName: string | null
    phone: string | null
    email: string | null
  }
  _count: { criteria: number; matches: number; offers: number }
}

interface Props {
  rows: BuyerRow[]
  total: number
}

export function BuyerTable({ rows, total }: Props) {
  const router = useRouter()

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No buyers yet — add your first buyer above</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
        {total} buyer{total !== 1 ? 's' : ''}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
            <th className="text-left px-4 py-2.5">Name</th>
            <th className="text-left px-4 py-2.5">Contact</th>
            <th className="text-left px-4 py-2.5">Markets</th>
            <th className="text-left px-4 py-2.5">Criteria</th>
            <th className="text-left px-4 py-2.5">Matches</th>
            <th className="text-left px-4 py-2.5">Offers</th>
            <th className="text-left px-4 py-2.5">Status</th>
            <th className="text-left px-4 py-2.5">Added</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => router.push(`/buyers/${row.id}`)}
              className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">
                  {[row.contact.firstName, row.contact.lastName].filter(Boolean).join(' ')}
                </p>
              </td>
              <td className="px-4 py-3">
                <p className="text-gray-600">{row.contact.phone ?? '—'}</p>
                <p className="text-[11px] text-gray-400">{row.contact.email ?? ''}</p>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {row.preferredMarkets.slice(0, 3).map((m) => (
                    <span key={m} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded">
                      {m}
                    </span>
                  ))}
                  {row.preferredMarkets.length > 3 && (
                    <span className="text-[10px] text-gray-400">+{row.preferredMarkets.length - 3}</span>
                  )}
                  {row.preferredMarkets.length === 0 && <span className="text-gray-300 text-[11px]">—</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-gray-600">{row._count.criteria}</td>
              <td className="px-4 py-3 text-gray-600">{row._count.matches}</td>
              <td className="px-4 py-3 text-gray-600">{row._count.offers}</td>
              <td className="px-4 py-3">
                {row.isActive ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[11px] font-medium">
                    <UserCheck className="w-3 h-3" /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-medium">
                    <UserX className="w-3 h-3" /> Inactive
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-[11px] text-gray-400">
                {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Write AddBuyerModal**

Create `apps/web/src/components/buyers/AddBuyerModal.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  open: boolean
  onClose: () => void
}

export function AddBuyerModal({ open, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    const body = {
      firstName: fd.get('firstName') as string,
      lastName: (fd.get('lastName') as string) || undefined,
      email: (fd.get('email') as string) || undefined,
      phone: (fd.get('phone') as string) || undefined,
      notes: (fd.get('notes') as string) || undefined,
    }

    const res = await fetch('/api/buyers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(typeof json.error === 'string' ? json.error : 'Failed to create buyer')
      return
    }

    startTransition(() => {
      router.push(`/buyers/${json.data.id}`)
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Buyer</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First Name *</label>
              <input
                name="firstName"
                required
                placeholder="John"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
              <input
                name="lastName"
                placeholder="Smith"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
            <input
              name="phone"
              type="tel"
              placeholder="(555) 000-0000"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              name="email"
              type="email"
              placeholder="john@example.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Cash buyer, closes quickly..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? 'Adding...' : 'Add Buyer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write BuyerCriteriaCard**

Create `apps/web/src/components/buyers/BuyerCriteriaCard.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Plus } from 'lucide-react'

interface CriteriaRow {
  id: string
  markets: string[]
  propertyTypes: string[]
  minBeds: number | null
  maxBeds: number | null
  minPrice: unknown
  maxPrice: unknown
  minArv: unknown
  maxArv: unknown
  maxRepairs: unknown
  notes: string | null
}

interface Props {
  buyerId: string
  criteria: CriteriaRow[]
}

export function BuyerCriteriaCard({ buyerId, criteria }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)

  async function deleteCriteria(criteriaId: string) {
    await fetch(`/api/buyers/${buyerId}/criteria`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteriaId }),
    })
    startTransition(() => router.refresh())
  }

  async function addCriteria(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    const body = {
      markets: (fd.get('markets') as string).split(',').map((s) => s.trim()).filter(Boolean),
      propertyTypes: (fd.get('propertyTypes') as string).split(',').map((s) => s.trim()).filter(Boolean),
      minPrice: fd.get('minPrice') ? parseFloat(fd.get('minPrice') as string) : undefined,
      maxPrice: fd.get('maxPrice') ? parseFloat(fd.get('maxPrice') as string) : undefined,
      minBeds: fd.get('minBeds') ? parseInt(fd.get('minBeds') as string) : undefined,
      maxBeds: fd.get('maxBeds') ? parseInt(fd.get('maxBeds') as string) : undefined,
      maxRepairs: fd.get('maxRepairs') ? parseFloat(fd.get('maxRepairs') as string) : undefined,
      notes: (fd.get('notes') as string) || undefined,
    }

    await fetch(`/api/buyers/${buyerId}/criteria`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setShowForm(false)
    startTransition(() => router.refresh())
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Buy Box Criteria</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add Criteria
        </button>
      </div>

      {showForm && (
        <form onSubmit={addCriteria} className="mb-4 border border-gray-100 rounded-lg p-3 bg-gray-50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Markets (comma-separated)</label>
              <input name="markets" placeholder="Dallas, Fort Worth" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Property Types</label>
              <input name="propertyTypes" placeholder="SFR, MFR" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Min Price ($)</label>
              <input name="minPrice" type="number" placeholder="50000" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max Price ($)</label>
              <input name="maxPrice" type="number" placeholder="300000" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Min Beds</label>
              <input name="minBeds" type="number" placeholder="2" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max Repairs ($)</label>
              <input name="maxRepairs" type="number" placeholder="30000" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <input name="notes" placeholder="Cash only, no MLS..." className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded">Cancel</button>
          </div>
        </form>
      )}

      {criteria.length === 0 ? (
        <p className="text-sm text-gray-400">No buy box criteria yet</p>
      ) : (
        <div className="space-y-3">
          {criteria.map((c) => (
            <div key={c.id} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1 text-sm flex-1">
                  {c.markets.length > 0 && (
                    <p><span className="text-gray-500">Markets:</span> <span className="text-gray-800">{c.markets.join(', ')}</span></p>
                  )}
                  {c.propertyTypes.length > 0 && (
                    <p><span className="text-gray-500">Types:</span> <span className="text-gray-800">{c.propertyTypes.join(', ')}</span></p>
                  )}
                  {(c.minPrice || c.maxPrice) && (
                    <p>
                      <span className="text-gray-500">Price:</span>{' '}
                      <span className="text-gray-800">
                        {c.minPrice ? `$${Number(c.minPrice).toLocaleString()}` : '$0'}
                        {' – '}
                        {c.maxPrice ? `$${Number(c.maxPrice).toLocaleString()}` : 'any'}
                      </span>
                    </p>
                  )}
                  {(c.minBeds || c.maxBeds) && (
                    <p>
                      <span className="text-gray-500">Beds:</span>{' '}
                      <span className="text-gray-800">{c.minBeds ?? 'any'} – {c.maxBeds ?? 'any'}</span>
                    </p>
                  )}
                  {c.maxRepairs && (
                    <p><span className="text-gray-500">Max Repairs:</span> <span className="text-gray-800">${Number(c.maxRepairs).toLocaleString()}</span></p>
                  )}
                  {c.notes && <p className="text-gray-500 italic">{c.notes}</p>}
                </div>
                <button
                  onClick={() => deleteCriteria(c.id)}
                  disabled={isPending}
                  className="text-gray-300 hover:text-red-500 ml-3 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Write BuyerMatchHistoryCard**

Create `apps/web/src/components/buyers/BuyerMatchHistoryCard.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'

interface MatchRow {
  id: string
  score: number
  notified: boolean
  createdAt: Date
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    state: string | null
    propertyStatus: string
    leadType: string
  }
}

interface Props {
  matches: MatchRow[]
}

export function BuyerMatchHistoryCard({ matches }: Props) {
  const router = useRouter()

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">
        Matched Properties <span className="text-gray-400 font-normal">({matches.length})</span>
      </h3>
      {matches.length === 0 ? (
        <p className="text-sm text-gray-400">No property matches yet</p>
      ) : (
        <div className="space-y-2">
          {matches.map((match) => {
            const pipeline = match.property.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
            return (
              <div
                key={match.id}
                onClick={() => {
                  const status = match.property.propertyStatus
                  const base = status === 'IN_TM' ? '/tm' : status === 'IN_INVENTORY' ? '/inventory' : status === 'IN_DISPO' ? '/dispo' : `/leads/${pipeline}`
                  router.push(`${base}/${match.property.id}`)
                }}
                className="flex items-center justify-between p-2 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {match.property.streetAddress ?? 'Unknown'}{match.property.city && `, ${match.property.city}`}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {match.property.propertyStatus.replace(/_/g, ' ')}
                    {' · '}{formatDistanceToNow(new Date(match.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <span className="text-[11px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                  Score: {match.score}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Write BuyerOfferHistoryCard**

Create `apps/web/src/components/buyers/BuyerOfferHistoryCard.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

interface OfferRow {
  id: string
  offerAmount: unknown
  status: string
  notes: string | null
  submittedAt: Date
  respondedAt: Date | null
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    leadType: string
  }
}

interface Props {
  offers: OfferRow[]
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:   'bg-yellow-50 text-yellow-700',
  ACCEPTED:  'bg-green-100 text-green-700',
  REJECTED:  'bg-red-50 text-red-700',
  COUNTERED: 'bg-blue-50 text-blue-700',
}

export function BuyerOfferHistoryCard({ offers }: Props) {
  const router = useRouter()

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">
        Offer History <span className="text-gray-400 font-normal">({offers.length})</span>
      </h3>
      {offers.length === 0 ? (
        <p className="text-sm text-gray-400">No offers submitted yet</p>
      ) : (
        <div className="space-y-2">
          {offers.map((offer) => {
            const pipeline = offer.property.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
            return (
              <div
                key={offer.id}
                onClick={() => router.push(`/leads/${pipeline}/${offer.property.id}`)}
                className="flex items-center justify-between p-2 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    ${Number(offer.offerAmount).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {offer.property.streetAddress ?? 'Unknown'}{offer.property.city && `, ${offer.property.city}`}
                    {' · '}{format(new Date(offer.submittedAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[offer.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {offer.status}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: TypeScript check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | grep "error TS" | head -20
```
Fix any errors.

- [ ] **Step 7: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/components/buyers/
git commit -m "feat: add BuyerTable, AddBuyerModal, BuyerCriteriaCard, BuyerMatchHistoryCard, BuyerOfferHistoryCard"
```

---

### Task 7: Vendor UI Components

**Files:**
- Create: `apps/web/src/components/vendors/VendorTable.tsx`
- Create: `apps/web/src/components/vendors/AddVendorModal.tsx`

- [ ] **Step 1: Write VendorTable**

Create `apps/web/src/components/vendors/VendorTable.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'

interface VendorRow {
  id: string
  category: string
  isActive: boolean
  markets: string[]
  notes: string | null
  createdAt: Date
  contact: {
    firstName: string
    lastName: string | null
    phone: string | null
    email: string | null
  }
}

interface Props {
  rows: VendorRow[]
  total: number
}

export function VendorTable({ rows, total }: Props) {
  const router = useRouter()

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No vendors yet — add your first vendor above</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
        {total} vendor{total !== 1 ? 's' : ''}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
            <th className="text-left px-4 py-2.5">Name</th>
            <th className="text-left px-4 py-2.5">Category</th>
            <th className="text-left px-4 py-2.5">Contact</th>
            <th className="text-left px-4 py-2.5">Markets</th>
            <th className="text-left px-4 py-2.5">Status</th>
            <th className="text-left px-4 py-2.5">Added</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => router.push(`/vendors/${row.id}`)}
              className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">
                  {[row.contact.firstName, row.contact.lastName].filter(Boolean).join(' ')}
                </p>
              </td>
              <td className="px-4 py-3">
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">
                  {row.category}
                </span>
              </td>
              <td className="px-4 py-3">
                <p className="text-gray-600">{row.contact.phone ?? '—'}</p>
                <p className="text-[11px] text-gray-400">{row.contact.email ?? ''}</p>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {row.markets.slice(0, 2).map((m) => (
                    <span key={m} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded">{m}</span>
                  ))}
                  {row.markets.length > 2 && (
                    <span className="text-[10px] text-gray-400">+{row.markets.length - 2}</span>
                  )}
                  {row.markets.length === 0 && <span className="text-gray-300 text-[11px]">—</span>}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${row.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {row.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="px-4 py-3 text-[11px] text-gray-400">
                {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Write AddVendorModal**

Create `apps/web/src/components/vendors/AddVendorModal.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  open: boolean
  onClose: () => void
}

const VENDOR_CATEGORIES = [
  'General Contractor',
  'Plumber',
  'Electrician',
  'HVAC',
  'Roofer',
  'Painter',
  'Flooring',
  'Inspector',
  'Title Company',
  'Attorney',
  'Insurance',
  'Property Manager',
  'Photographer',
  'Other',
]

export function AddVendorModal({ open, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    const body = {
      firstName: fd.get('firstName') as string,
      lastName: (fd.get('lastName') as string) || undefined,
      phone: (fd.get('phone') as string) || undefined,
      email: (fd.get('email') as string) || undefined,
      category: fd.get('category') as string,
      notes: (fd.get('notes') as string) || undefined,
    }

    const res = await fetch('/api/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(typeof json.error === 'string' ? json.error : 'Failed to create vendor')
      return
    }

    startTransition(() => {
      router.push(`/vendors/${json.data.id}`)
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Vendor</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First Name *</label>
              <input
                name="firstName"
                required
                placeholder="Jane"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
              <input
                name="lastName"
                placeholder="Doe"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category *</label>
            <select
              name="category"
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select category...</option>
              {VENDOR_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
            <input
              name="phone"
              type="tel"
              placeholder="(555) 000-0000"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              name="email"
              type="email"
              placeholder="jane@contractor.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Licensed in TX, great work on kitchens..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? 'Adding...' : 'Add Vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | grep "error TS" | head -20
```
Fix any errors.

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/components/vendors/
git commit -m "feat: add VendorTable and AddVendorModal components"
```

---

### Task 8: Buyer Pages

**Files:**
- Modify: `apps/web/src/app/(app)/buyers/page.tsx`
- Create: `apps/web/src/app/(app)/buyers/[id]/page.tsx`

- [ ] **Step 1: Write buyers header (Client Component for modal state)**

Create `apps/web/src/components/buyers/BuyersHeader.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AddBuyerModal } from './AddBuyerModal'

export function BuyersHeader() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Buyers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cash buyers and active purchasers</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Buyer
        </button>
      </div>
      <AddBuyerModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
```

- [ ] **Step 2: Write Buyers list page**

Replace `apps/web/src/app/(app)/buyers/page.tsx`:

```typescript
import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getBuyerList } from '@/lib/buyers'
import { BuyerTable } from '@/components/buyers/BuyerTable'
import { BuyersHeader } from '@/components/buyers/BuyersHeader'

interface PageProps {
  searchParams: Promise<{ search?: string; page?: string }>
}

export default async function BuyersPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const { rows, total } = await getBuyerList({
    search: sp.search,
    page: sp.page ? parseInt(sp.page) : 1,
  })

  return (
    <div>
      <BuyersHeader />
      <BuyerTable rows={rows as any} total={total} />
    </div>
  )
}
```

- [ ] **Step 3: Write Buyer detail page**

Create `apps/web/src/app/(app)/buyers/[id]/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getBuyerById } from '@/lib/buyers'
import { BuyerCriteriaCard } from '@/components/buyers/BuyerCriteriaCard'
import { BuyerMatchHistoryCard } from '@/components/buyers/BuyerMatchHistoryCard'
import { BuyerOfferHistoryCard } from '@/components/buyers/BuyerOfferHistoryCard'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type Params = { params: Promise<{ id: string }> }

export default async function BuyerDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const buyer = await getBuyerById(id)
  if (!buyer) notFound()

  const fullName = [buyer.contact.firstName, buyer.contact.lastName].filter(Boolean).join(' ')

  return (
    <div>
      <Link href="/buyers" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
        <ChevronLeft className="w-4 h-4" />
        Buyers
      </Link>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              {buyer.contact.phone && <span>{buyer.contact.phone}</span>}
              {buyer.contact.email && <span>{buyer.contact.email}</span>}
            </div>
            {buyer.notes && (
              <p className="text-sm text-gray-500 mt-2 max-w-lg">{buyer.notes}</p>
            )}
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${buyer.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {buyer.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        {buyer.preferredMarkets.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {buyer.preferredMarkets.map((m) => (
              <span key={m} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{m}</span>
            ))}
          </div>
        )}
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <BuyerCriteriaCard buyerId={buyer.id} criteria={buyer.criteria as any} />
          <BuyerMatchHistoryCard matches={buyer.matches as any} />
        </div>
        <div className="space-y-4">
          <BuyerOfferHistoryCard offers={buyer.offers as any} />
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Contact Info</h3>
            <dl className="space-y-1.5 text-sm">
              {([
                ['Phone', buyer.contact.phone],
                ['Phone 2', buyer.contact.phone2],
                ['Email', buyer.contact.email],
                ['Address', buyer.contact.address],
                ['City', buyer.contact.city],
                ['State', buyer.contact.state],
              ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-gray-500 flex-shrink-0">{label}</dt>
                  <dd className="text-gray-900 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | grep "error TS" | head -20
```
Fix any errors.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/components/buyers/BuyersHeader.tsx "apps/web/src/app/(app)/buyers/"
git commit -m "feat: implement Buyers list and detail pages"
```

---

### Task 9: Vendor Pages

**Files:**
- Modify: `apps/web/src/app/(app)/vendors/page.tsx`
- Create: `apps/web/src/app/(app)/vendors/[id]/page.tsx`

- [ ] **Step 1: Write vendors header (Client Component for modal state)**

Create `apps/web/src/components/vendors/VendorsHeader.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AddVendorModal } from './AddVendorModal'

export function VendorsHeader() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vendors</h1>
          <p className="text-sm text-gray-500 mt-0.5">Contractors, title companies, and service providers</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Vendor
        </button>
      </div>
      <AddVendorModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
```

- [ ] **Step 2: Write Vendors list page**

Replace `apps/web/src/app/(app)/vendors/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getVendorList } from '@/lib/vendors'
import { VendorTable } from '@/components/vendors/VendorTable'
import { VendorsHeader } from '@/components/vendors/VendorsHeader'

interface PageProps {
  searchParams: Promise<{ search?: string; category?: string; page?: string }>
}

export default async function VendorsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const { rows, total } = await getVendorList({
    search: sp.search,
    category: sp.category,
    page: sp.page ? parseInt(sp.page) : 1,
  })

  return (
    <div>
      <VendorsHeader />
      <VendorTable rows={rows as any} total={total} />
    </div>
  )
}
```

- [ ] **Step 3: Write Vendor detail page**

Create `apps/web/src/app/(app)/vendors/[id]/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getVendorById } from '@/lib/vendors'
import Link from 'next/link'
import { ChevronLeft, Phone, Mail, MapPin } from 'lucide-react'

type Params = { params: Promise<{ id: string }> }

export default async function VendorDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const vendor = await getVendorById(id)
  if (!vendor) notFound()

  const fullName = [vendor.contact.firstName, vendor.contact.lastName].filter(Boolean).join(' ')

  return (
    <div>
      <Link href="/vendors" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
        <ChevronLeft className="w-4 h-4" />
        Vendors
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                {vendor.category}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              {vendor.contact.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  {vendor.contact.phone}
                </span>
              )}
              {vendor.contact.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {vendor.contact.email}
                </span>
              )}
              {vendor.contact.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {[vendor.contact.city, vendor.contact.state].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
            {vendor.notes && (
              <p className="text-sm text-gray-500 mt-2 max-w-lg">{vendor.notes}</p>
            )}
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${vendor.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {vendor.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        {vendor.markets.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {vendor.markets.map((m) => (
              <span key={m} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{m}</span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Contact Details</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {([
            ['Phone', vendor.contact.phone],
            ['Phone 2', vendor.contact.phone2],
            ['Email', vendor.contact.email],
            ['Address', vendor.contact.address],
            ['City', vendor.contact.city],
            ['State', vendor.contact.state],
            ['Zip', vendor.contact.zip],
          ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
            <div key={label}>
              <dt className="text-gray-500">{label}</dt>
              <dd className="text-gray-900 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | grep "error TS" | head -20
```
Fix any errors.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/components/vendors/VendorsHeader.tsx "apps/web/src/app/(app)/vendors/"
git commit -m "feat: implement Vendors list and detail pages"
```

---

### Task 10: Build Verification

**Files:** None — verification only

- [ ] **Step 1: Run all tests**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run 2>&1 | tail -25
```
Expected: All tests pass (19 from Phase 3B + 12 new archive/buyers/vendors = ~31 total)

- [ ] **Step 2: Full TypeScript check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | grep "error TS" | head -30
```
Expected: Zero errors

- [ ] **Step 3: Next.js production build**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web"
PATH=/c/node-x64:$PATH /c/node-x64/node.exe node_modules/.bin/next build 2>&1 | tail -35
```
Expected: Build succeeds, new routes visible (`/sold`, `/rental`, `/buyers`, `/buyers/[id]`, `/vendors`, `/vendors/[id]`)

- [ ] **Step 4: Final commit (only if fixes made)**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git status
# Only commit if there were fixes
git add -A
git commit -m "fix: Phase 4 build verification fixes"
```

---

## Summary

**What Phase 4 delivers:**

- **Sold Archive** (`/sold`) — filterable table of sold properties showing exit strategy, sold price, and date; links back to lead detail
- **Rental Archive** (`/rental`) — filterable table of rental properties
- **Buyers** (`/buyers`) — full buyer management: list, detail page with buy box criteria (add/delete), matched properties history, offer history
- **Vendors** (`/vendors`) — vendor management: list and detail page with contact info, category, market coverage

**What Phase 4 does NOT include:**
- Buyer auto-matching engine (algorithm that scores properties vs. BuyerCriteria) → Phase 5
- Twilio SMS blast to buyers → Phase 5
- Campaigns / drip sequences → Phase 5
- Analytics / reporting (`/analytics`) → Phase 6
- Settings / user management (`/settings`) → Phase 6
- List stacking (`/list-stacking`) → Phase 6
- Email client (`/email`) → Phase 6
