# Phase 5 — Buyer Auto-Matching, Campaigns, and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the buyer auto-matching engine (scores active buyers against dispo properties), a full campaigns/drip module (CRUD + steps + enrollments), and live in-app notifications replacing the static bell placeholder.

**Architecture:** Buyer matching is a pure scoring function + Prisma upsert, triggered synchronously inside the existing promote route when a property transitions to `IN_DISPO`. Campaigns follow the same Server Component + Route Handler pattern as all prior phases. Notifications are fetched server-side in `GlobalHeader` and passed as props to a Client Component bell that handles interactive dropdown state.

**Tech Stack:** Next.js 15 App Router, Prisma 7 (`@crm/database`), Zod, Tailwind CSS 4, Vitest, `date-fns`, `lucide-react`

---

## Actual Schema Field Names (MEMORIZE THESE)

```
Property:       bedrooms: Int?  |  bathrooms: Decimal?  |  sqft: Int?  |  askingPrice: Decimal?
                arv: Decimal?   |  repairEstimate: Decimal?  |  propertyType: String?
                marketId: String  +  market: Market (market.name is the match key)

BuyerCriteria:  markets: String[]  |  propertyTypes: String[]
                minBeds / maxBeds: Int?
                minBaths / maxBaths: Decimal?
                minPrice / maxPrice: Decimal?
                minSqft / maxSqft: Int?
                minArv / maxArv: Decimal?
                maxRepairs: Decimal?

BuyerMatch:     id, buyerId, propertyId, score: Int, notified: Boolean
                @@unique([buyerId, propertyId])  → upsert key: buyerId_propertyId

Campaign:       id, name, type: CampaignType (DRIP|BROADCAST), status: CampaignStatus
                description?, marketId?, tags: String[], leadTypes: LeadType[]

CampaignStep:   id, campaignId, order: Int, delayDays: Int, delayHours: Int
                channel: MessageChannel, subject?, body: String, isActive: Boolean

CampaignEnrollment: id, campaignId, propertyId, currentStep: Int, isActive: Boolean
                    pausedAt?, completedAt?, enrolledAt
                    @@unique([campaignId, propertyId])

Notification:   id, userId, type: NotificationType, title, body?, propertyId?, isRead, readAt?
NotificationType enum: NEW_LEAD | MESSAGE_RECEIVED | TASK_DUE | STAGE_CHANGE | MENTION | SYSTEM
```

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/lib/buyer-matching.ts` | CREATE | `scoreCriteria()` pure fn + `runBuyerMatching()` DB fn |
| `apps/web/src/lib/__tests__/buyer-matching.test.ts` | CREATE | 6 tests |
| `apps/web/src/app/api/properties/[id]/match-buyers/route.ts` | CREATE | POST — manual re-run of buyer matching |
| `apps/web/src/app/api/properties/[id]/promote/route.ts` | MODIFY | Call `runBuyerMatching` on `→ IN_DISPO` transition |
| `apps/web/src/app/api/markets/route.ts` | CREATE | GET — returns active markets for campaign form |
| `apps/web/src/lib/campaigns.ts` | CREATE | `getCampaignList()` + `getCampaignById()` |
| `apps/web/src/lib/__tests__/campaigns.test.ts` | CREATE | 4 tests |
| `apps/web/src/app/api/campaigns/route.ts` | CREATE | GET list + POST create |
| `apps/web/src/app/api/campaigns/[id]/route.ts` | CREATE | PATCH update + DELETE |
| `apps/web/src/app/api/campaigns/[id]/steps/route.ts` | CREATE | POST add step + DELETE remove step |
| `apps/web/src/app/api/campaigns/[id]/enroll/route.ts` | CREATE | POST enroll property + DELETE unenroll |
| `apps/web/src/components/campaigns/CampaignTable.tsx` | CREATE | List table (name, type, status, steps, enrollments) |
| `apps/web/src/components/campaigns/AddCampaignModal.tsx` | CREATE | Create campaign form modal |
| `apps/web/src/components/campaigns/CampaignStepList.tsx` | CREATE | Steps list with inline add + delete |
| `apps/web/src/components/campaigns/EnrollmentList.tsx` | CREATE | Enrolled properties list with unenroll |
| `apps/web/src/components/campaigns/CampaignsHeader.tsx` | CREATE | Client Component holding AddCampaignModal state |
| `apps/web/src/app/(app)/campaigns/page.tsx` | CREATE | Campaign list page |
| `apps/web/src/app/(app)/campaigns/[id]/page.tsx` | CREATE | Campaign detail page |
| `apps/web/src/components/layout/Sidebar.tsx` | MODIFY | Add Campaigns under Tools section |
| `apps/web/src/lib/notifications.ts` | CREATE | `getUnreadNotifications()` |
| `apps/web/src/app/api/notifications/route.ts` | CREATE | GET unread |
| `apps/web/src/app/api/notifications/[id]/read/route.ts` | CREATE | POST mark single as read |
| `apps/web/src/app/api/notifications/read-all/route.ts` | CREATE | POST mark all as read |
| `apps/web/src/components/layout/NotificationBell.tsx` | CREATE | Client Component — bell icon + dropdown |
| `apps/web/src/components/layout/GlobalHeader.tsx` | MODIFY | Fetch unread notifications, replace static bell with `<NotificationBell>` |

---

## Scoring Reference

`scoreCriteria` awards points in these categories (total possible: **100**):

| Category | Points | Hard Disqualifier? |
|----------|--------|--------------------|
| Market match (or no market filter) | 20 | Yes — returns 0 if criteria.markets.length > 0 and property market not in list |
| Property type match (or no type filter) | 10 | Yes — returns 0 if criteria.propertyTypes.length > 0 and property type not in list |
| Beds in range | 10 | No |
| Baths in range | 10 | No |
| Price in range | 20 | No |
| Sqft in range | 10 | No |
| ARV in range | 10 | No |
| Repair estimate ≤ maxRepairs (or no limit) | 10 | No |

**Match threshold: 40** — a buyer match record is only created/updated when score ≥ 40.

**Null handling:** If a property field is `null`, that criterion contributes 0 points (cannot evaluate). If a criteria bound is `null`, that bound is unconstrained (passes, contributes points). Decimal fields from Prisma must be converted via `Number()` before numeric comparison.

---

### Task 1: Buyer Scoring Library + Tests

**Files:**
- Create: `apps/web/src/lib/buyer-matching.ts`
- Create: `apps/web/src/lib/__tests__/buyer-matching.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/__tests__/buyer-matching.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { scoreCriteria } from '../buyer-matching'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    property: { findUniqueOrThrow: vi.fn() },
    buyer: { findMany: vi.fn() },
    buyerMatch: { upsert: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { runBuyerMatching } from '../buyer-matching'

const baseCriteria = {
  markets: [] as string[],
  propertyTypes: [] as string[],
  minBeds: null, maxBeds: null,
  minBaths: null, maxBaths: null,
  minPrice: null, maxPrice: null,
  minSqft: null, maxSqft: null,
  minArv: null, maxArv: null,
  maxRepairs: null,
}

const baseProperty = {
  marketName: 'DFW',
  propertyType: null as string | null,
  bedrooms: null as number | null,
  bathrooms: null as number | null,
  askingPrice: null as number | null,
  sqft: null as number | null,
  arv: null as number | null,
  repairEstimate: null as number | null,
}

describe('scoreCriteria', () => {
  it('returns 0 when market does not match (hard disqualifier)', () => {
    const score = scoreCriteria(
      { ...baseCriteria, markets: ['DFW'] },
      { ...baseProperty, marketName: 'Houston' }
    )
    expect(score).toBe(0)
  })

  it('returns 0 when property type does not match (hard disqualifier)', () => {
    const score = scoreCriteria(
      { ...baseCriteria, markets: ['DFW'], propertyTypes: ['Single Family'] },
      { ...baseProperty, marketName: 'DFW', propertyType: 'Multi-Family' }
    )
    expect(score).toBe(0)
  })

  it('returns 100 when all criteria fully match', () => {
    const score = scoreCriteria(
      {
        markets: ['DFW'],
        propertyTypes: ['Single Family'],
        minBeds: 3, maxBeds: 5,
        minBaths: 2, maxBaths: 4,
        minPrice: 100000, maxPrice: 300000,
        minSqft: 1200, maxSqft: 2500,
        minArv: 150000, maxArv: 400000,
        maxRepairs: 50000,
      },
      {
        marketName: 'DFW',
        propertyType: 'Single Family',
        bedrooms: 4,
        bathrooms: 2,
        askingPrice: 200000,
        sqft: 1800,
        arv: 250000,
        repairEstimate: 30000,
      }
    )
    expect(score).toBe(100)
  })

  it('returns partial score when only market and price match', () => {
    // Market (20) + no type filter (10) + no beds/baths/sqft/arv (null props) + price (20) + no repair limit (10) = 60
    const score = scoreCriteria(
      { ...baseCriteria, markets: ['DFW'], minPrice: 100000, maxPrice: 300000 },
      { ...baseProperty, marketName: 'DFW', askingPrice: 200000 }
    )
    expect(score).toBe(60)
  })
})

describe('runBuyerMatching', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates BuyerMatch records for qualifying buyers', async () => {
    vi.mocked(prisma.property.findUniqueOrThrow).mockResolvedValue({
      id: 'prop1', bedrooms: 4, bathrooms: 2, sqft: 1800, askingPrice: 200000,
      arv: 250000, repairEstimate: 30000, propertyType: 'Single Family',
      market: { name: 'DFW' },
    } as any)
    vi.mocked(prisma.buyer.findMany).mockResolvedValue([{
      id: 'buyer1', isActive: true,
      criteria: [{
        ...baseCriteria,
        markets: ['DFW'], minPrice: 100000, maxPrice: 300000,
      }],
    }] as any)
    vi.mocked(prisma.buyerMatch.upsert).mockResolvedValue({} as any)

    const count = await runBuyerMatching('prop1')
    expect(count).toBe(1)
    expect(prisma.buyerMatch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { buyerId_propertyId: { buyerId: 'buyer1', propertyId: 'prop1' } },
        create: expect.objectContaining({ score: expect.any(Number) }),
      })
    )
  })

  it('skips buyers whose best criteria score is below threshold', async () => {
    vi.mocked(prisma.property.findUniqueOrThrow).mockResolvedValue({
      id: 'prop1', bedrooms: 2, bathrooms: 1, sqft: 800, askingPrice: 400000,
      arv: 200000, repairEstimate: 80000, propertyType: 'Multi-Family',
      market: { name: 'Houston' },
    } as any)
    vi.mocked(prisma.buyer.findMany).mockResolvedValue([{
      id: 'buyer1', isActive: true,
      criteria: [{ ...baseCriteria, markets: ['DFW'] }], // Hard disqualifier: wrong market
    }] as any)

    const count = await runBuyerMatching('prop1')
    expect(count).toBe(0)
    expect(prisma.buyerMatch.upsert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web test run apps/web/src/lib/__tests__/buyer-matching.test.ts 2>&1
```

Expected: FAIL — `Cannot find module '../buyer-matching'`

- [ ] **Step 3: Create `apps/web/src/lib/buyer-matching.ts`**

```typescript
import { prisma } from '@/lib/prisma'

export interface ScoringCriteria {
  markets: string[]
  propertyTypes: string[]
  minBeds: number | null
  maxBeds: number | null
  minBaths: number | null
  maxBaths: number | null
  minPrice: number | null
  maxPrice: number | null
  minSqft: number | null
  maxSqft: number | null
  minArv: number | null
  maxArv: number | null
  maxRepairs: number | null
}

export interface ScoringProperty {
  marketName: string
  propertyType: string | null
  bedrooms: number | null
  bathrooms: number | null
  askingPrice: number | null
  sqft: number | null
  arv: number | null
  repairEstimate: number | null
}

/** Pure scoring function — no DB. Returns 0–100. */
export function scoreCriteria(c: ScoringCriteria, p: ScoringProperty): number {
  let score = 0

  // Market — hard disqualifier
  if (c.markets.length > 0 && !c.markets.includes(p.marketName)) return 0
  score += 20

  // Property type — hard disqualifier
  if (c.propertyTypes.length > 0 && p.propertyType != null) {
    if (!c.propertyTypes.includes(p.propertyType)) return 0
  }
  score += 10

  // Beds (+10)
  if (p.bedrooms != null) {
    const ok = (c.minBeds == null || p.bedrooms >= c.minBeds) &&
               (c.maxBeds == null || p.bedrooms <= c.maxBeds)
    if (ok) score += 10
  }

  // Baths (+10)
  if (p.bathrooms != null) {
    const b = Number(p.bathrooms)
    const ok = (c.minBaths == null || b >= Number(c.minBaths)) &&
               (c.maxBaths == null || b <= Number(c.maxBaths))
    if (ok) score += 10
  }

  // Price (+20)
  if (p.askingPrice != null) {
    const pr = Number(p.askingPrice)
    const ok = (c.minPrice == null || pr >= Number(c.minPrice)) &&
               (c.maxPrice == null || pr <= Number(c.maxPrice))
    if (ok) score += 20
  }

  // Sqft (+10)
  if (p.sqft != null) {
    const ok = (c.minSqft == null || p.sqft >= c.minSqft) &&
               (c.maxSqft == null || p.sqft <= c.maxSqft)
    if (ok) score += 10
  }

  // ARV (+10)
  if (p.arv != null) {
    const a = Number(p.arv)
    const ok = (c.minArv == null || a >= Number(c.minArv)) &&
               (c.maxArv == null || a <= Number(c.maxArv))
    if (ok) score += 10
  }

  // Repair estimate (+10)
  if (c.maxRepairs == null) {
    score += 10 // No cap = full points
  } else if (p.repairEstimate != null) {
    if (Number(p.repairEstimate) <= Number(c.maxRepairs)) score += 10
  }

  return score
}

const MATCH_THRESHOLD = 40

/** Scores all active buyers against the given property, upserts BuyerMatch records. Returns match count. */
export async function runBuyerMatching(propertyId: string): Promise<number> {
  const property = await prisma.property.findUniqueOrThrow({
    where: { id: propertyId },
    include: { market: true },
  })

  const buyers = await prisma.buyer.findMany({
    where: { isActive: true },
    include: { criteria: true },
  })

  const qualified: Array<{ buyerId: string; score: number }> = []

  for (const buyer of buyers) {
    let best = 0
    for (const c of buyer.criteria) {
      const s = scoreCriteria(
        {
          markets: c.markets,
          propertyTypes: c.propertyTypes,
          minBeds: c.minBeds,
          maxBeds: c.maxBeds,
          minBaths: c.minBaths != null ? Number(c.minBaths) : null,
          maxBaths: c.maxBaths != null ? Number(c.maxBaths) : null,
          minPrice: c.minPrice != null ? Number(c.minPrice) : null,
          maxPrice: c.maxPrice != null ? Number(c.maxPrice) : null,
          minSqft: c.minSqft,
          maxSqft: c.maxSqft,
          minArv: c.minArv != null ? Number(c.minArv) : null,
          maxArv: c.maxArv != null ? Number(c.maxArv) : null,
          maxRepairs: c.maxRepairs != null ? Number(c.maxRepairs) : null,
        },
        {
          marketName: property.market.name,
          propertyType: property.propertyType,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms != null ? Number(property.bathrooms) : null,
          askingPrice: property.askingPrice != null ? Number(property.askingPrice) : null,
          sqft: property.sqft,
          arv: property.arv != null ? Number(property.arv) : null,
          repairEstimate: property.repairEstimate != null ? Number(property.repairEstimate) : null,
        }
      )
      if (s > best) best = s
    }
    if (best >= MATCH_THRESHOLD) qualified.push({ buyerId: buyer.id, score: best })
  }

  await Promise.all(
    qualified.map(({ buyerId, score }) =>
      prisma.buyerMatch.upsert({
        where: { buyerId_propertyId: { buyerId, propertyId } },
        create: { buyerId, propertyId, score, notified: false },
        update: { score },
      })
    )
  )

  return qualified.length
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web test run apps/web/src/lib/__tests__/buyer-matching.test.ts 2>&1
```

Expected: 6 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/lib/buyer-matching.ts apps/web/src/lib/__tests__/buyer-matching.test.ts && git commit -m "feat: add buyer scoring library and runBuyerMatching with tests"
```

---

### Task 2: Buyer Auto-Match Route Handler + Promote Trigger

**Files:**
- Create: `apps/web/src/app/api/properties/[id]/match-buyers/route.ts`
- Modify: `apps/web/src/app/api/properties/[id]/promote/route.ts`

- [ ] **Step 1: Create `apps/web/src/app/api/properties/[id]/match-buyers/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { runBuyerMatching } from '@/lib/buyer-matching'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const count = await runBuyerMatching(id)
    return NextResponse.json({ matched: count })
  } catch {
    return NextResponse.json({ error: 'Matching failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Read the current promote route to find the IN_DISPO transition point**

Read `apps/web/src/app/api/properties/[id]/promote/route.ts` to locate where `propertyStatus: 'IN_DISPO'` is set in the update payload.

- [ ] **Step 3: Modify promote route to trigger matching on → IN_DISPO**

In `apps/web/src/app/api/properties/[id]/promote/route.ts`, add the import at the top:

```typescript
import { runBuyerMatching } from '@/lib/buyer-matching'
```

Then, after the `prisma.property.update(...)` call that sets `propertyStatus: 'IN_DISPO'`, add:

```typescript
  // Fire buyer matching whenever a property enters Dispo
  if (to === 'IN_DISPO') {
    runBuyerMatching(id).catch((err) =>
      console.error('[promote] buyer matching failed:', err)
    )
  }
```

Note: `.catch()` is intentional — matching runs fire-and-forget so it doesn't block the promote response.

- [ ] **Step 4: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/app/api/properties/[id]/match-buyers/route.ts apps/web/src/app/api/properties/[id]/promote/route.ts && git commit -m "feat: add buyer auto-matching route and trigger on IN_DISPO promote"
```

---

### Task 3: Markets API + Campaign Query Helpers + Tests

**Files:**
- Create: `apps/web/src/app/api/markets/route.ts`
- Create: `apps/web/src/lib/campaigns.ts`
- Create: `apps/web/src/lib/__tests__/campaigns.test.ts`

- [ ] **Step 1: Write failing campaign tests**

Create `apps/web/src/lib/__tests__/campaigns.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    campaign: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getCampaignList, getCampaignById } from '../campaigns'

describe('getCampaignList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns paginated rows and total', async () => {
    vi.mocked(prisma.campaign.findMany).mockResolvedValue([
      { id: 'c1', name: 'Follow-Up Drip', type: 'DRIP', status: 'ACTIVE' },
    ] as any)
    vi.mocked(prisma.campaign.count).mockResolvedValue(1)

    const result = await getCampaignList()
    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('applies type filter', async () => {
    vi.mocked(prisma.campaign.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.campaign.count).mockResolvedValue(0)

    await getCampaignList({ type: 'BROADCAST' })
    expect(prisma.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'BROADCAST' }) })
    )
  })
})

describe('getCampaignById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns campaign with steps and enrollments', async () => {
    vi.mocked(prisma.campaign.findUnique).mockResolvedValue({
      id: 'c1',
      name: 'Test',
      steps: [{ id: 's1', order: 1, channel: 'SMS', body: 'Hi' }],
      enrollments: [],
    } as any)

    const result = await getCampaignById('c1')
    expect(result?.steps).toHaveLength(1)
  })

  it('returns null for unknown id', async () => {
    vi.mocked(prisma.campaign.findUnique).mockResolvedValue(null)
    const result = await getCampaignById('nonexistent')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web test run apps/web/src/lib/__tests__/campaigns.test.ts 2>&1
```

Expected: FAIL — `Cannot find module '../campaigns'`

- [ ] **Step 3: Create `apps/web/src/lib/campaigns.ts`**

```typescript
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@crm/database'

export interface CampaignFilter {
  type?: 'DRIP' | 'BROADCAST'
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  search?: string
  page?: number
  pageSize?: number
}

export async function getCampaignList(filter: CampaignFilter = {}) {
  const { type, status, search, page = 1, pageSize = 25 } = filter

  const where: Prisma.CampaignWhereInput = {}
  if (type) where.type = type
  if (status) where.status = status
  if (search) where.name = { contains: search, mode: 'insensitive' }

  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: {
        market: { select: { name: true } },
        _count: { select: { steps: true, enrollments: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.campaign.count({ where }),
  ])

  return { rows, total }
}

export async function getCampaignById(id: string) {
  return prisma.campaign.findUnique({
    where: { id },
    include: {
      market: true,
      steps: { orderBy: { order: 'asc' } },
      enrollments: {
        where: { isActive: true },
        include: {
          property: {
            select: {
              id: true,
              streetAddress: true,
              city: true,
              propertyStatus: true,
              leadType: true,
            },
          },
        },
        orderBy: { enrolledAt: 'desc' },
        take: 50,
      },
    },
  })
}
```

- [ ] **Step 4: Create `apps/web/src/app/api/markets/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const markets = await prisma.market.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(markets)
}
```

- [ ] **Step 5: Run campaign tests to confirm they pass**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web test run apps/web/src/lib/__tests__/campaigns.test.ts 2>&1
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/lib/campaigns.ts apps/web/src/lib/__tests__/campaigns.test.ts apps/web/src/app/api/markets/route.ts && git commit -m "feat: add campaign query helpers with tests and markets API route"
```

---

### Task 4: Campaign Route Handlers

**Files:**
- Create: `apps/web/src/app/api/campaigns/route.ts`
- Create: `apps/web/src/app/api/campaigns/[id]/route.ts`
- Create: `apps/web/src/app/api/campaigns/[id]/steps/route.ts`
- Create: `apps/web/src/app/api/campaigns/[id]/enroll/route.ts`

- [ ] **Step 1: Create `apps/web/src/app/api/campaigns/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCampaignList } from '@/lib/campaigns'

const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['DRIP', 'BROADCAST']),
  description: z.string().optional(),
  marketId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  leadTypes: z.array(z.enum(['DIRECT_TO_SELLER', 'DIRECT_TO_AGENT'])).default([]),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const result = await getCampaignList({
    type: (sp.get('type') as 'DRIP' | 'BROADCAST') ?? undefined,
    status: (sp.get('status') as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED') ?? undefined,
    search: sp.get('search') ?? undefined,
    page: sp.get('page') ? parseInt(sp.get('page')!) : 1,
  })

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateCampaignSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { name, type, description, marketId, tags, leadTypes } = parsed.data

  const campaign = await prisma.campaign.create({
    data: { name, type, description, marketId, tags, leadTypes },
  })

  return NextResponse.json(campaign, { status: 201 })
}
```

- [ ] **Step 2: Create `apps/web/src/app/api/campaigns/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const UpdateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
  description: z.string().optional(),
  marketId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  leadTypes: z.array(z.enum(['DIRECT_TO_SELLER', 'DIRECT_TO_AGENT'])).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateCampaignSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const campaign = await prisma.campaign.update({ where: { id }, data: parsed.data })
  return NextResponse.json(campaign)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.campaign.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Create `apps/web/src/app/api/campaigns/[id]/steps/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const CreateStepSchema = z.object({
  channel: z.enum(['SMS', 'CALL', 'RVM', 'EMAIL', 'NOTE', 'SYSTEM']),
  subject: z.string().optional(),
  body: z.string().min(1),
  delayDays: z.number().int().min(0).default(0),
  delayHours: z.number().int().min(0).default(0),
})

const DeleteStepSchema = z.object({
  stepId: z.string().min(1),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const body = await req.json()
  const parsed = CreateStepSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Auto-assign next order
  const lastStep = await prisma.campaignStep.findFirst({
    where: { campaignId },
    orderBy: { order: 'desc' },
    select: { order: true },
  })
  const order = (lastStep?.order ?? 0) + 1

  const step = await prisma.campaignStep.create({
    data: { campaignId, order, ...parsed.data },
  })

  return NextResponse.json(step, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const body = await req.json()
  const parsed = DeleteStepSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Verify step belongs to this campaign
  await prisma.campaignStep.deleteMany({
    where: { id: parsed.data.stepId, campaignId },
  })

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Create `apps/web/src/app/api/campaigns/[id]/enroll/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const EnrollSchema = z.object({ propertyId: z.string().min(1) })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const body = await req.json()
  const parsed = EnrollSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const enrollment = await prisma.campaignEnrollment.upsert({
    where: { campaignId_propertyId: { campaignId, propertyId: parsed.data.propertyId } },
    create: { campaignId, propertyId: parsed.data.propertyId, currentStep: 0, isActive: true },
    update: { isActive: true, currentStep: 0, completedAt: null, pausedAt: null },
  })

  return NextResponse.json(enrollment, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const body = await req.json()
  const parsed = EnrollSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  await prisma.campaignEnrollment.updateMany({
    where: { campaignId, propertyId: parsed.data.propertyId },
    data: { isActive: false },
  })

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/app/api/campaigns && git commit -m "feat: add campaign, step, and enrollment route handlers"
```

---

### Task 5: Campaign UI Components

**Files:**
- Create: `apps/web/src/components/campaigns/CampaignTable.tsx`
- Create: `apps/web/src/components/campaigns/AddCampaignModal.tsx`
- Create: `apps/web/src/components/campaigns/CampaignStepList.tsx`
- Create: `apps/web/src/components/campaigns/EnrollmentList.tsx`
- Create: `apps/web/src/components/campaigns/CampaignsHeader.tsx`

- [ ] **Step 1: Create `apps/web/src/components/campaigns/CampaignTable.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

interface CampaignRow {
  id: string
  name: string
  type: 'DRIP' | 'BROADCAST'
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  market: { name: string } | null
  updatedAt: Date | string
  _count: { steps: number; enrollments: number }
}

const TYPE_BADGE: Record<string, string> = {
  DRIP: 'bg-blue-50 text-blue-700',
  BROADCAST: 'bg-purple-50 text-purple-700',
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  PAUSED: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-sky-50 text-sky-700',
  ARCHIVED: 'bg-gray-100 text-gray-400',
}

interface Props {
  rows: CampaignRow[]
  total: number
}

export function CampaignTable({ rows, total }: Props) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No campaigns yet — create one above.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          {total} campaign{total !== 1 ? 's' : ''}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {['Name', 'Type', 'Status', 'Market', 'Steps', 'Enrolled', 'Updated'].map((h) => (
              <th key={h} className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link href={`/campaigns/${row.id}`} className="font-medium text-blue-600 hover:underline truncate block max-w-[220px]">
                  {row.name}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_BADGE[row.type] ?? ''}`}>
                  {row.type}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[row.status] ?? ''}`}>
                  {row.status}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600">{row.market?.name ?? '—'}</td>
              <td className="px-4 py-3 text-gray-600">{row._count.steps}</td>
              <td className="px-4 py-3 text-gray-600">{row._count.enrollments}</td>
              <td className="px-4 py-3 text-gray-400 text-[11px]">
                {formatDistanceToNow(new Date(row.updatedAt), { addSuffix: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Create `apps/web/src/components/campaigns/AddCampaignModal.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

interface Market {
  id: string
  name: string
}

interface Props {
  open: boolean
  onClose: () => void
}

export function AddCampaignModal({ open, onClose }: Props) {
  const router = useRouter()
  const [markets, setMarkets] = useState<Market[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState<'DRIP' | 'BROADCAST'>('DRIP')
  const [description, setDescription] = useState('')
  const [marketId, setMarketId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    fetch('/api/markets').then((r) => r.json()).then(setMarkets).catch(() => {})
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type, description: description.trim() || undefined, marketId: marketId || undefined }),
      })
      if (!res.ok) throw new Error('Failed to create campaign')
      const campaign = await res.json()
      onClose()
      setName(''); setDescription(''); setMarketId('')
      router.push(`/campaigns/${campaign.id}`)
    } catch {
      setError('Failed to create campaign. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">New Campaign</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Campaign Name *</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 30-Day Seller Follow-Up"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Type *</label>
            <select
              value={type} onChange={(e) => setType(e.target.value as 'DRIP' | 'BROADCAST')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="DRIP">Drip (automated sequence)</option>
              <option value="BROADCAST">Broadcast (one-time blast)</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Market</label>
            <select
              value={marketId} onChange={(e) => setMarketId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Markets</option>
              {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Description</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Optional description..."
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()}
              className="flex-1 bg-blue-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `apps/web/src/components/campaigns/CampaignStepList.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

interface CampaignStep {
  id: string
  order: number
  channel: string
  subject: string | null
  body: string
  delayDays: number
  delayHours: number
  isActive: boolean
}

interface Props {
  campaignId: string
  steps: CampaignStep[]
}

const CHANNELS = ['SMS', 'EMAIL', 'CALL', 'RVM', 'NOTE'] as const

const CHANNEL_COLOR: Record<string, string> = {
  SMS: 'bg-blue-50 text-blue-700',
  EMAIL: 'bg-purple-50 text-purple-700',
  CALL: 'bg-emerald-50 text-emerald-700',
  RVM: 'bg-amber-50 text-amber-700',
  NOTE: 'bg-gray-100 text-gray-700',
}

export function CampaignStepList({ campaignId, steps }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [channel, setChannel] = useState<'SMS' | 'EMAIL' | 'CALL' | 'RVM' | 'NOTE'>('SMS')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [delayDays, setDelayDays] = useState(0)
  const [delayHours, setDelayHours] = useState(0)
  const [saving, setSaving] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    try {
      await fetch(`/api/campaigns/${campaignId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, subject: subject.trim() || undefined, body: body.trim(), delayDays, delayHours }),
      })
      setBody(''); setSubject(''); setDelayDays(0); setDelayHours(0)
      setShowForm(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(stepId: string) {
    if (!confirm('Delete this step?')) return
    await fetch(`/api/campaigns/${campaignId}/steps`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepId }),
    })
    router.refresh()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-[13px] font-semibold text-gray-900">
          Steps ({steps.length})
        </h3>
        <button onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:text-blue-700">
          {showForm ? <ChevronUp className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? 'Cancel' : 'Add Step'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="p-4 border-b border-gray-100 bg-slate-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Channel *</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Send After</label>
              <div className="flex gap-1.5 items-center">
                <input type="number" min={0} value={delayDays} onChange={(e) => setDelayDays(Number(e.target.value))}
                  className="w-14 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <span className="text-xs text-gray-500">d</span>
                <input type="number" min={0} max={23} value={delayHours} onChange={(e) => setDelayHours(Number(e.target.value))}
                  className="w-14 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <span className="text-xs text-gray-500">h</span>
              </div>
            </div>
          </div>
          {channel === 'EMAIL' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Email subject line" />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Message Body *</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={3}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="Message text..." />
          </div>
          <button type="submit" disabled={saving || !body.trim()}
            className="bg-blue-600 text-white text-xs font-semibold rounded-lg px-4 py-1.5 hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Adding…' : 'Add Step'}
          </button>
        </form>
      )}

      {steps.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No steps yet — add the first step above.
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {steps.map((step, idx) => (
            <div key={step.id} className="px-4 py-3 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[11px] font-bold text-gray-500 flex-shrink-0 mt-0.5">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${CHANNEL_COLOR[step.channel] ?? 'bg-gray-100 text-gray-600'}`}>
                    {step.channel}
                  </span>
                  {step.delayDays > 0 || step.delayHours > 0 ? (
                    <span className="text-[11px] text-gray-400">
                      after {step.delayDays > 0 ? `${step.delayDays}d ` : ''}{step.delayHours > 0 ? `${step.delayHours}h` : ''}
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400">immediately</span>
                  )}
                </div>
                {step.subject && <p className="text-[12px] font-medium text-gray-700 truncate">{step.subject}</p>}
                <p className="text-[12px] text-gray-600 line-clamp-2">{step.body}</p>
              </div>
              <button onClick={() => handleDelete(step.id)}
                className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `apps/web/src/components/campaigns/EnrollmentList.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

interface Enrollment {
  id: string
  currentStep: number
  enrolledAt: Date | string
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    propertyStatus: string
    leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
  }
}

interface Props {
  campaignId: string
  enrollments: Enrollment[]
}

function propertyHref(p: { id: string; propertyStatus: string; leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT' }): string {
  if (p.propertyStatus === 'IN_TM') return `/tm/${p.id}`
  if (p.propertyStatus === 'IN_INVENTORY') return `/inventory/${p.id}`
  if (p.propertyStatus === 'IN_DISPO') return `/dispo/${p.id}`
  const base = p.leadType === 'DIRECT_TO_SELLER' ? '/leads/dts' : '/leads/dta'
  return `${base}/${p.id}`
}

export function EnrollmentList({ campaignId, enrollments }: Props) {
  const router = useRouter()

  async function handleUnenroll(propertyId: string) {
    if (!confirm('Remove this property from the campaign?')) return
    await fetch(`/api/campaigns/${campaignId}/enroll`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId }),
    })
    router.refresh()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-[13px] font-semibold text-gray-900">
          Active Enrollments ({enrollments.length})
        </h3>
      </div>
      {enrollments.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No properties enrolled. Enroll from a property&#39;s detail page.
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {enrollments.map((enr) => (
            <div key={enr.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Link href={propertyHref(enr.property)}
                  className="text-sm font-medium text-blue-600 hover:underline truncate block">
                  {enr.property.streetAddress ?? 'No address'}{enr.property.city ? `, ${enr.property.city}` : ''}
                </Link>
                <p className="text-[11px] text-gray-400">
                  Step {enr.currentStep + 1} · enrolled {new Date(enr.enrolledAt).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => handleUnenroll(enr.property.id)}
                className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create `apps/web/src/components/campaigns/CampaignsHeader.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AddCampaignModal } from './AddCampaignModal'

export function CampaignsHeader() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-0.5">Drip sequences and broadcast messages</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>
      <AddCampaignModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
```

- [ ] **Step 6: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/components/campaigns && git commit -m "feat: add campaign UI components (table, modal, step list, enrollment list)"
```

---

### Task 6: Campaign Pages + Sidebar Update

**Files:**
- Create: `apps/web/src/app/(app)/campaigns/page.tsx`
- Create: `apps/web/src/app/(app)/campaigns/[id]/page.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create `apps/web/src/app/(app)/campaigns/page.tsx`**

```tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getCampaignList } from '@/lib/campaigns'
import { CampaignTable } from '@/components/campaigns/CampaignTable'
import { CampaignsHeader } from '@/components/campaigns/CampaignsHeader'

interface PageProps {
  searchParams: Promise<{ type?: string; status?: string; search?: string; page?: string }>
}

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
```

- [ ] **Step 2: Create `apps/web/src/app/(app)/campaigns/[id]/page.tsx`**

```tsx
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getCampaignById } from '@/lib/campaigns'
import { CampaignStepList } from '@/components/campaigns/CampaignStepList'
import { EnrollmentList } from '@/components/campaigns/EnrollmentList'

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

export default async function CampaignDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const campaign = await getCampaignById(id)
  if (!campaign) notFound()

  return (
    <div>
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
          <CampaignStepList campaignId={campaign.id} steps={campaign.steps as any} />
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
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add Campaigns to sidebar**

In `apps/web/src/components/layout/Sidebar.tsx`, find the Tools section:

```typescript
  {
    label: 'Tools',
    items: [
      { label: 'Calendar', href: '/calendar' },
      { label: 'Tasks', href: '/tasks' },
      { label: 'Activity', href: '/activity' },
      { label: 'List Stacking', href: '/list-stacking' },
    ],
  },
```

Replace it with:

```typescript
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
```

- [ ] **Step 4: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/app/\(app\)/campaigns apps/web/src/components/layout/Sidebar.tsx && git commit -m "feat: add campaign list and detail pages, add Campaigns to sidebar"
```

---

### Task 7: Notification Query Helper + Route Handlers

**Files:**
- Create: `apps/web/src/lib/notifications.ts`
- Create: `apps/web/src/app/api/notifications/route.ts`
- Create: `apps/web/src/app/api/notifications/[id]/read/route.ts`
- Create: `apps/web/src/app/api/notifications/read-all/route.ts`

- [ ] **Step 1: Create `apps/web/src/lib/notifications.ts`**

```typescript
import { prisma } from '@/lib/prisma'

export async function getUnreadNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId, isRead: false },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      propertyId: true,
      isRead: true,
      createdAt: true,
    },
  })
}

export type UnreadNotification = Awaited<ReturnType<typeof getUnreadNotifications>>[number]
```

- [ ] **Step 2: Create `apps/web/src/app/api/notifications/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUnreadNotifications } from '@/lib/notifications'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notifications = await getUnreadNotifications(session.user.id as string)
  return NextResponse.json(notifications)
}
```

- [ ] **Step 3: Create `apps/web/src/app/api/notifications/[id]/read/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  await prisma.notification.updateMany({
    where: { id, userId: session.user.id as string },
    data: { isRead: true, readAt: new Date() },
  })

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Create `apps/web/src/app/api/notifications/read-all/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.notification.updateMany({
    where: { userId: session.user.id as string, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/lib/notifications.ts apps/web/src/app/api/notifications && git commit -m "feat: add notifications query helper and route handlers"
```

---

### Task 8: NotificationBell Component + GlobalHeader Integration

**Files:**
- Create: `apps/web/src/components/layout/NotificationBell.tsx`
- Modify: `apps/web/src/components/layout/GlobalHeader.tsx`

- [ ] **Step 1: Create `apps/web/src/components/layout/NotificationBell.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, X } from 'lucide-react'
import type { UnreadNotification } from '@/lib/notifications'
import { formatDistanceToNow } from 'date-fns'

const TYPE_ICON: Record<string, string> = {
  NEW_LEAD: '🏠',
  MESSAGE_RECEIVED: '💬',
  TASK_DUE: '✅',
  STAGE_CHANGE: '🔄',
  MENTION: '@',
  SYSTEM: '⚙️',
}

interface Props {
  initialNotifications: UnreadNotification[]
}

export function NotificationBell({ initialNotifications }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)

  const unreadCount = notifications.length

  async function markAllRead() {
    await fetch('/api/notifications/read-all', { method: 'POST' })
    setNotifications([])
    router.refresh()
  }

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        className="relative w-8 h-8 rounded-[7px] bg-slate-50 border border-gray-200 flex items-center justify-center hover:bg-gray-100"
        title="Notifications"
      >
        <Bell className="w-4 h-4 text-gray-500" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] bg-red-500 rounded-full border border-white flex items-center justify-center text-[9px] font-bold text-white px-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <span className="text-[13px] font-semibold text-gray-900">
                Notifications {unreadCount > 0 && <span className="text-gray-400">({unreadCount})</span>}
              </span>
              {unreadCount > 0 && (
                <button onClick={markAllRead}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                All caught up!
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                {notifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                    <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICON[n.type] ?? '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-800 truncate">{n.title}</p>
                      {n.body && <p className="text-[11px] text-gray-500 truncate">{n.body}</p>}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <button onClick={() => markRead(n.id)} className="text-gray-300 hover:text-gray-500 flex-shrink-0 mt-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Modify `apps/web/src/components/layout/GlobalHeader.tsx`**

Add the import at the top of the file:

```tsx
import { NotificationBell } from '@/components/layout/NotificationBell'
import { getUnreadNotifications } from '@/lib/notifications'
```

In the `GlobalHeader` async function, fetch notifications alongside markets:

```tsx
  const [markets, notifications] = await Promise.all([
    prisma.market.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    session?.user?.id ? getUnreadNotifications(session.user.id as string) : [],
  ])
```

(Replace the existing `const markets = await prisma.market.findMany(...)` line with this `Promise.all`.)

Then in the JSX, replace the static bell button:

```tsx
        <button className="relative w-8 h-8 rounded-[7px] bg-slate-50 border border-gray-200 flex items-center justify-center text-sm hover:bg-gray-100">
          🔔
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full border border-white" />
        </button>
```

With:

```tsx
        <NotificationBell initialNotifications={notifications} />
```

- [ ] **Step 3: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1
```

Expected: Zero errors. If `session.user.id` type causes issues, cast it: `(session?.user as any)?.id`.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/components/layout/NotificationBell.tsx apps/web/src/components/layout/GlobalHeader.tsx && git commit -m "feat: add live NotificationBell component to GlobalHeader"
```

---

### Task 9: Build Verification

**Files:** No new files — run checks only.

- [ ] **Step 1: Run all tests**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web test run 2>&1
```

Expected: All tests pass. Count should be ~37 (31 from Phase 4 + 6 new buyer-matching + 4 campaign = 41 total; some test files may have been merged). Zero failures.

If any tests fail:
- Read the failing test file and the source file it imports
- Fix the mismatch (usually a function rename or import path)
- Re-run

- [ ] **Step 2: Full TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1
```

Expected: Zero errors. Common fixes needed:
- `params`/`searchParams` must be `await`-ed (they are `Promise<{...}>` in Next.js 15 App Router)
- Decimal fields from Prisma need `Number()` conversion before comparisons
- `session.user.id` — cast as `(session.user as any).id` if User type doesn't include `id`

- [ ] **Step 3: Production build**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web build 2>&1
```

Expected: Build succeeds. New routes visible in output:
- `/campaigns` (static → server-rendered)
- `/campaigns/[id]` (dynamic, server-rendered)
- Notification bell functional in header

- [ ] **Step 4: Commit any fixes**

If any fixes were needed during steps 1-3:

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add -A && git commit -m "fix: resolve Phase 5 build and type errors"
```

---

## Summary

**What Phase 5 delivers:**
- **Buyer Auto-Matching Engine** — Pure scoring function (`scoreCriteria`, 100-point scale) + `runBuyerMatching` that scores all active buyers against a property and upserts `BuyerMatch` records ≥ 40 points. Fires automatically on every `→ IN_DISPO` promote. Also callable manually via `POST /api/properties/[id]/match-buyers`.
- **Campaigns Module** (`/campaigns`, `/campaigns/[id]`) — Full CRUD for drip and broadcast campaigns. Steps management (add/delete, channel, delay). Active enrollment tracking with unenroll. Campaigns appear in the sidebar under Tools.
- **Live Notification Bell** — Replaces the static placeholder in `GlobalHeader`. Shows real unread count badge, scrollable dropdown with dismiss-per-notification + mark-all-read. Backed by the `Notification` model.

**What Phase 5 does NOT include:**
- Twilio SMS integration (requires external credentials) → Phase 6
- Drip campaign worker execution (BullMQ `drip-campaign` job processor) → Phase 6
- Enroll-in-campaign button on property detail pages → Phase 6
- Analytics/reporting (`/analytics`) → Phase 6
- Settings/user management (`/settings`) → Phase 6
- List stacking (`/list-stacking`) → Phase 6
- Email client (`/email`) → Phase 6
