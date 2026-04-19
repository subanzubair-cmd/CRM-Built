# Phase 6 — Analytics, Settings, Email Client, List Stacking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all four remaining ComingSoon stubs (/analytics, /settings, /email, /list-stacking) with fully functional pages backed by real data.

**Architecture:** Analytics and Settings follow the Server Component + Route Handler pattern. Settings uses URL-based tab navigation (`?tab=team|profile|markets`) so all data fetches are server-side. Email client is a filtered view over existing Conversation/Message infrastructure (channel=EMAIL). List Stacking parses CSV uploads in the Next.js route handler, creates `ListStackSource` records, imports Property rows, and detects overlaps via `list:${sourceId}` property tags.

**Tech Stack:** Next.js 15 App Router, Prisma 7, Zod, Tailwind CSS 4, Vitest, `date-fns`, `lucide-react`

---

## Actual Schema Field Names (MEMORIZE THESE)

```
Property:         bedrooms, bathrooms: Decimal?, sqft, askingPrice: Decimal?, offerPrice: Decimal?
                  arv: Decimal?, repairEstimate: Decimal?, leadType, leadStatus, propertyStatus
                  activeLeadStage: ActiveLeadStage?, exitStrategy: ExitStrategy?, soldAt: DateTime?
                  marketId (required), createdById (required), tags: String[]

User:             id, email, passwordHash, name, phone?, avatarUrl?, status: UserStatus, roleId
                  marketIds: String[]
UserStatus enum:  ACTIVE | INACTIVE | INVITED

Role:             id, name, description?, permissions: String[], isSystem: Boolean

Market:           id, name, state (default "TX"), isActive: Boolean
                  relations: properties, campaigns

ListStackSource:  id, name, description?, tags: String[], totalImported: Int
                  (NO propertyId relation — properties track source via tags: ["list:<sourceId>"])

Conversation:     id, propertyId, lastMessageAt, messages (relation)
Message:          id, conversationId, propertyId, channel: MessageChannel, direction, body, sentById?
MessageChannel enum: SMS | CALL | RVM | EMAIL | NOTE | SYSTEM

activeLeadStage enum: NEW_LEAD | DISCOVERY | INTERESTED_ADD_TO_FOLLOW_UP | APPOINTMENT_MADE |
                      DUE_DILIGENCE | OFFER_MADE | OFFER_FOLLOW_UP | UNDER_CONTRACT
exitStrategy enum:    WHOLESALE | SELLER_FINANCE | INSTALLMENT | FIX_AND_FLIP |
                      INVENTORY_LATER | RENTAL | TURNKEY
```

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/lib/analytics.ts` | CREATE | `getAnalyticsOverview()` — 8 parallel DB queries |
| `apps/web/src/lib/__tests__/analytics.test.ts` | CREATE | 2 tests |
| `apps/web/src/app/(app)/analytics/page.tsx` | REPLACE ComingSoon | KPI cards + bar chart + funnel + exit breakdown |
| `apps/web/src/lib/settings.ts` | CREATE | `getUserList()`, `getMarketList()`, `getRoleList()` |
| `apps/web/src/lib/__tests__/settings.test.ts` | CREATE | 3 tests |
| `apps/web/src/app/api/markets/route.ts` | MODIFY | Add POST handler (create market) |
| `apps/web/src/app/api/markets/[id]/route.ts` | CREATE | PATCH (rename / toggle isActive) |
| `apps/web/src/app/api/users/route.ts` | CREATE | GET list + POST invite |
| `apps/web/src/app/api/users/[id]/route.ts` | CREATE | PATCH (status / role / name / phone) |
| `apps/web/src/app/api/profile/route.ts` | CREATE | PATCH own profile (name, phone) |
| `apps/web/src/components/settings/TeamTable.tsx` | CREATE | User list with deactivate action |
| `apps/web/src/components/settings/InviteUserModal.tsx` | CREATE | Invite form modal |
| `apps/web/src/components/settings/MarketsPanel.tsx` | CREATE | Market list + add + toggle |
| `apps/web/src/components/settings/ProfileForm.tsx` | CREATE | Edit own name/phone |
| `apps/web/src/app/(app)/settings/page.tsx` | REPLACE ComingSoon | URL-tab layout: Team / Profile / Markets |
| `apps/web/src/lib/email.ts` | CREATE | `getEmailConversations()` |
| `apps/web/src/components/email/EmailInbox.tsx` | CREATE | Email conversation list |
| `apps/web/src/components/email/ComposeEmailModal.tsx` | CREATE | Compose new email |
| `apps/web/src/app/(app)/email/page.tsx` | REPLACE ComingSoon | Email client page |
| `apps/web/src/lib/list-stacking.ts` | CREATE | `getListSources()`, `getOverlapProperties()` |
| `apps/web/src/lib/__tests__/list-stacking.test.ts` | CREATE | 3 tests |
| `apps/web/src/app/api/list-stacking/route.ts` | CREATE | GET sources + POST CSV import |
| `apps/web/src/app/api/list-stacking/[id]/route.ts` | CREATE | DELETE source |
| `apps/web/src/components/list-stacking/ListSourceTable.tsx` | CREATE | Sources list with delete |
| `apps/web/src/components/list-stacking/ImportListModal.tsx` | CREATE | CSV upload form |
| `apps/web/src/components/list-stacking/OverlapPanel.tsx` | CREATE | Properties in 2+ lists |
| `apps/web/src/components/list-stacking/ListStackingHeader.tsx` | CREATE | Header + import button |
| `apps/web/src/app/(app)/list-stacking/page.tsx` | REPLACE ComingSoon | List stacking page |

---

### Task 1: Analytics Query Helpers + Tests

**Files:**
- Create: `apps/web/src/lib/analytics.ts`
- Create: `apps/web/src/lib/__tests__/analytics.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/lib/__tests__/analytics.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    property: {
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getAnalyticsOverview } from '../analytics'

describe('getAnalyticsOverview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns expected shape with correct mapped values', async () => {
    vi.mocked(prisma.property.count).mockResolvedValue(12)
    vi.mocked(prisma.property.aggregate).mockResolvedValue({
      _sum: { offerPrice: '1500000' },
    } as any)
    vi.mocked(prisma.property.groupBy).mockResolvedValue([
      { activeLeadStage: 'NEW_LEAD', _count: { activeLeadStage: 5 } },
    ] as any)

    const result = await getAnalyticsOverview()

    expect(result.activeLeads).toBe(12)
    expect(result.newLeadsThisMonth).toBe(12)
    expect(result.soldThisYear).toBe(12)
    expect(result.revenueThisYear).toBe(1500000)
    expect(result.pipelineStages).toHaveLength(1)
    expect(result.weeklyVolume).toHaveLength(8)
    expect(result.weeklyVolume.every((v) => v === 12)).toBe(true)
  })

  it('returns zero revenue when offerPrice sum is null', async () => {
    vi.mocked(prisma.property.count).mockResolvedValue(0)
    vi.mocked(prisma.property.aggregate).mockResolvedValue({
      _sum: { offerPrice: null },
    } as any)
    vi.mocked(prisma.property.groupBy).mockResolvedValue([] as any)

    const result = await getAnalyticsOverview()
    expect(result.revenueThisYear).toBe(0)
    expect(result.exitBreakdown).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web test run apps/web/src/lib/__tests__/analytics.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../analytics'`

- [ ] **Step 3: Create `apps/web/src/lib/analytics.ts`**

```typescript
import { prisma } from '@/lib/prisma'

export async function getAnalyticsOverview() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  const [
    activeLeads,
    newLeadsThisMonth,
    inTm,
    soldThisYear,
    revenueResult,
    pipelineStages,
    exitBreakdown,
    weeklyVolume,
  ] = await Promise.all([
    prisma.property.count({ where: { leadStatus: 'ACTIVE' } }),
    prisma.property.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.property.count({ where: { propertyStatus: 'IN_TM' } }),
    prisma.property.count({ where: { propertyStatus: 'SOLD', soldAt: { gte: startOfYear } } }),
    prisma.property.aggregate({
      where: { propertyStatus: 'SOLD', soldAt: { gte: startOfYear } },
      _sum: { offerPrice: true },
    }),
    prisma.property.groupBy({
      by: ['activeLeadStage'],
      where: { leadStatus: 'ACTIVE', activeLeadStage: { not: null } },
      _count: { activeLeadStage: true },
    }),
    prisma.property.groupBy({
      by: ['exitStrategy'],
      where: { exitStrategy: { not: null } },
      _count: { exitStrategy: true },
    }),
    Promise.all(
      Array.from({ length: 8 }, (_, i) => {
        const weekStart = new Date(now)
        weekStart.setDate(weekStart.getDate() - 7 * (7 - i))
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekEnd.getDate() + 7)
        return prisma.property.count({ where: { createdAt: { gte: weekStart, lt: weekEnd } } })
      })
    ),
  ])

  return {
    activeLeads,
    newLeadsThisMonth,
    inTm,
    soldThisYear,
    revenueThisYear: Number(revenueResult._sum.offerPrice ?? 0),
    pipelineStages,
    exitBreakdown,
    weeklyVolume,
  }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web test run apps/web/src/lib/__tests__/analytics.test.ts 2>&1 | tail -10
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/lib/analytics.ts apps/web/src/lib/__tests__/analytics.test.ts && git commit -m "feat: add analytics query helpers with tests"
```

---

### Task 2: Analytics Dashboard Page

**Files:**
- Replace: `apps/web/src/app/(app)/analytics/page.tsx`

- [ ] **Step 1: Replace `apps/web/src/app/(app)/analytics/page.tsx`**

```tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getAnalyticsOverview } from '@/lib/analytics'

const STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: 'New Lead',
  DISCOVERY: 'Discovery',
  INTERESTED_ADD_TO_FOLLOW_UP: 'Interested / Follow Up',
  APPOINTMENT_MADE: 'Appointment Made',
  DUE_DILIGENCE: 'Due Diligence',
  OFFER_MADE: 'Offer Made',
  OFFER_FOLLOW_UP: 'Offer Follow Up',
  UNDER_CONTRACT: 'Under Contract',
}

const STAGE_ORDER = [
  'NEW_LEAD', 'DISCOVERY', 'INTERESTED_ADD_TO_FOLLOW_UP', 'APPOINTMENT_MADE',
  'DUE_DILIGENCE', 'OFFER_MADE', 'OFFER_FOLLOW_UP', 'UNDER_CONTRACT',
]

const EXIT_COLORS: Record<string, string> = {
  WHOLESALE: 'bg-blue-500',
  SELLER_FINANCE: 'bg-purple-500',
  INSTALLMENT: 'bg-indigo-500',
  FIX_AND_FLIP: 'bg-amber-500',
  INVENTORY_LATER: 'bg-orange-500',
  RENTAL: 'bg-emerald-500',
  TURNKEY: 'bg-teal-500',
}

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const data = await getAnalyticsOverview()

  const maxWeek = Math.max(...data.weeklyVolume, 1)
  const totalExits = data.exitBreakdown.reduce((s, e) => s + (e._count as any).exitStrategy, 0)
  const maxStage = Math.max(...data.pipelineStages.map((s) => (s._count as any).activeLeadStage), 1)
  const stageMap = Object.fromEntries(
    data.pipelineStages.map((s) => [s.activeLeadStage ?? '', (s._count as any).activeLeadStage as number])
  )
  const weeks = Array.from({ length: 8 }, (_, i) => (i === 7 ? 'Now' : `W${8 - i}`))

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-5">
        {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} — All Markets
      </p>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Active Leads', value: data.activeLeads, color: 'text-blue-600' },
          { label: 'New This Month', value: data.newLeadsThisMonth, color: 'text-blue-500' },
          { label: 'In TM Pipeline', value: data.inTm, color: 'text-indigo-600' },
          { label: 'Sold This Year', value: data.soldThisYear, color: 'text-emerald-600' },
          {
            label: 'Revenue YTD',
            value: data.revenueThisYear >= 1000
              ? `$${(data.revenueThisYear / 1000).toFixed(0)}K`
              : `$${data.revenueThisYear}`,
            color: 'text-emerald-700',
          },
        ].map((w) => (
          <div key={w.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">{w.label}</p>
            <p className={`text-2xl font-extrabold ${w.color}`}>{w.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Weekly Volume Chart */}
        <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[13px] font-semibold text-gray-900 mb-3">Lead Volume — Last 8 Weeks</p>
          <div className="flex items-end gap-1.5 h-24">
            {data.weeklyVolume.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] text-gray-400">{count > 0 ? count : ''}</span>
                <div
                  className={`w-full rounded-t ${i === 7 ? 'bg-blue-600' : 'bg-blue-100'}`}
                  style={{ height: `${Math.max((count / maxWeek) * 100, 4)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex mt-1.5">
            {weeks.map((w) => (
              <span key={w} className="flex-1 text-center text-[9px] text-gray-400">{w}</span>
            ))}
          </div>
        </div>

        {/* Exit Strategy Breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[13px] font-semibold text-gray-900 mb-3">Exit Strategy</p>
          {data.exitBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
          ) : (
            <div className="space-y-2">
              {data.exitBreakdown.map((e) => {
                const cnt = (e._count as any).exitStrategy as number
                const pct = totalExits > 0 ? Math.round((cnt / totalExits) * 100) : 0
                const colorClass = EXIT_COLORS[e.exitStrategy ?? ''] ?? 'bg-gray-300'
                return (
                  <div key={e.exitStrategy}>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span className="text-gray-600">{(e.exitStrategy ?? '').replace(/_/g, ' ')}</span>
                      <span className="font-medium text-gray-800">{cnt} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${colorClass} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pipeline Funnel */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-[13px] font-semibold text-gray-900 mb-3">Active Lead Pipeline</p>
        <div className="space-y-2">
          {STAGE_ORDER.map((stage) => {
            const count = stageMap[stage] ?? 0
            const pct = Math.max((count / maxStage) * 100, 2)
            return (
              <div key={stage} className="flex items-center gap-3">
                <span className="text-[11px] text-gray-500 w-48 flex-shrink-0">{STAGE_LABELS[stage]}</span>
                <div className="flex-1 h-5 bg-gray-50 border border-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-100 border-r border-blue-300 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[12px] font-semibold text-gray-700 w-6 text-right">{count}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/app/\(app\)/analytics/page.tsx && git commit -m "feat: implement analytics dashboard with KPI cards, pipeline funnel, and charts"
```

---

### Task 3: Settings Query Helpers + Tests

**Files:**
- Create: `apps/web/src/lib/settings.ts`
- Create: `apps/web/src/lib/__tests__/settings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/lib/__tests__/settings.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    market: { findMany: vi.fn() },
    role: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { getUserList, getMarketList, getRoleList } from '../settings'

describe('getUserList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns users with their role', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', name: 'Alice', email: 'alice@test.com', status: 'ACTIVE', role: { id: 'r1', name: 'Admin' } },
    ] as any)
    const result = await getUserList()
    expect(result).toHaveLength(1)
    expect(result[0].role.name).toBe('Admin')
  })

  it('returns empty array when no users', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any)
    const result = await getUserList()
    expect(result).toHaveLength(0)
  })
})

describe('getMarketList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns markets with property counts', async () => {
    vi.mocked(prisma.market.findMany).mockResolvedValue([
      { id: 'm1', name: 'DFW', state: 'TX', isActive: true, _count: { properties: 42 } },
    ] as any)
    const result = await getMarketList()
    expect(result[0]._count.properties).toBe(42)
  })
})

describe('getRoleList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns roles ordered by name', async () => {
    vi.mocked(prisma.role.findMany).mockResolvedValue([
      { id: 'r1', name: 'Admin' },
      { id: 'r2', name: 'Agent' },
    ] as any)
    const result = await getRoleList()
    expect(result).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web test run apps/web/src/lib/__tests__/settings.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../settings'`

- [ ] **Step 3: Create `apps/web/src/lib/settings.ts`**

```typescript
import { prisma } from '@/lib/prisma'

export async function getUserList() {
  return prisma.user.findMany({
    include: { role: { select: { id: true, name: true } } },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  })
}

export async function getMarketList() {
  return prisma.market.findMany({
    include: { _count: { select: { properties: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function getRoleList() {
  return prisma.role.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web test run apps/web/src/lib/__tests__/settings.test.ts 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/lib/settings.ts apps/web/src/lib/__tests__/settings.test.ts && git commit -m "feat: add settings query helpers with tests"
```

---

### Task 4: Settings Route Handlers

**Files:**
- Modify: `apps/web/src/app/api/markets/route.ts` (add POST)
- Create: `apps/web/src/app/api/markets/[id]/route.ts`
- Create: `apps/web/src/app/api/users/route.ts`
- Create: `apps/web/src/app/api/users/[id]/route.ts`
- Create: `apps/web/src/app/api/profile/route.ts`

- [ ] **Step 1: Add POST to `apps/web/src/app/api/markets/route.ts`**

Read the file first. It currently only has a GET handler. Add a POST handler below it:

```typescript
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

// Add this schema and POST export to the existing file
const CreateMarketSchema = z.object({
  name: z.string().min(1),
  state: z.string().default('TX'),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateMarketSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const market = await prisma.market.create({ data: { name: parsed.data.name, state: parsed.data.state } })
  return NextResponse.json(market, { status: 201 })
}
```

Note: The existing file already imports `auth`, `NextResponse`, and `prisma`. Add `NextRequest` to the NextResponse import if not present, add the `z` import, and append the schema + POST export.

- [ ] **Step 2: Create `apps/web/src/app/api/markets/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const UpdateMarketSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  state: z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateMarketSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const market = await prisma.market.update({ where: { id }, data: parsed.data })
  return NextResponse.json(market)
}
```

- [ ] **Step 3: Create `apps/web/src/app/api/users/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getUserList } from '@/lib/settings'

const InviteUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  roleId: z.string().min(1),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const users = await getUserList()
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = InviteUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 })

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      roleId: parsed.data.roleId,
      passwordHash: 'INVITE_PENDING',
      status: 'INVITED',
    },
    include: { role: { select: { id: true, name: true } } },
  })

  return NextResponse.json(user, { status: 201 })
}
```

- [ ] **Step 4: Create `apps/web/src/app/api/users/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const UpdateUserSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  roleId: z.string().optional(),
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const user = await prisma.user.update({
    where: { id },
    data: parsed.data,
    include: { role: { select: { id: true, name: true } } },
  })

  return NextResponse.json(user)
}
```

- [ ] **Step 5: Create `apps/web/src/app/api/profile/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
})

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const user = await prisma.user.update({
    where: { id: (session.user as any).id as string },
    data: parsed.data,
    select: { id: true, name: true, phone: true, email: true },
  })

  return NextResponse.json(user)
}
```

- [ ] **Step 6: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/app/api/markets apps/web/src/app/api/users apps/web/src/app/api/profile && git commit -m "feat: add settings route handlers (users, profile, markets CRUD)"
```

---

### Task 5: Settings UI Components

**Files:**
- Create: `apps/web/src/components/settings/TeamTable.tsx`
- Create: `apps/web/src/components/settings/InviteUserModal.tsx`
- Create: `apps/web/src/components/settings/MarketsPanel.tsx`
- Create: `apps/web/src/components/settings/ProfileForm.tsx`

- [ ] **Step 1: Create `apps/web/src/components/settings/TeamTable.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserCheck, UserX, UserPlus } from 'lucide-react'
import { InviteUserModal } from './InviteUserModal'

interface UserRow {
  id: string
  name: string
  email: string
  phone: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'INVITED'
  role: { id: string; name: string }
}

interface Role {
  id: string
  name: string
}

interface Props {
  users: UserRow[]
  roles: Role[]
  currentUserId: string
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  INACTIVE: 'bg-gray-100 text-gray-500',
  INVITED: 'bg-amber-50 text-amber-700',
}

export function TeamTable({ users, roles, currentUserId }: Props) {
  const router = useRouter()
  const [inviteOpen, setInviteOpen] = useState(false)

  async function toggleStatus(user: UserRow) {
    if (user.id === currentUserId) return
    const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    router.refresh()
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            {users.length} team member{users.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invite User
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Name', 'Email', 'Role', 'Status', ''].map((h) => (
                <th key={h} className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3 text-gray-600">{u.role.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[u.status] ?? ''}`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.id !== currentUserId && u.status !== 'INVITED' && (
                    <button
                      onClick={() => toggleStatus(u)}
                      className={`flex items-center gap-1 text-[11px] font-medium ${u.status === 'ACTIVE' ? 'text-red-500 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-700'}`}
                      title={u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    >
                      {u.status === 'ACTIVE' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InviteUserModal open={inviteOpen} onClose={() => setInviteOpen(false)} roles={roles} />
    </>
  )
}
```

- [ ] **Step 2: Create `apps/web/src/components/settings/InviteUserModal.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

interface Role {
  id: string
  name: string
}

interface Props {
  open: boolean
  onClose: () => void
  roles: Role[]
}

export function InviteUserModal({ open, onClose, roles }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !roleId) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), roleId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to invite user')
      }
      onClose()
      setName(''); setEmail('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite user')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Invite Team Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Full Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Jane Smith" />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="jane@homewardpartners.com" />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Role *</label>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim() || !email.trim()}
              className="flex-1 bg-blue-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Inviting…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `apps/web/src/components/settings/MarketsPanel.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ToggleLeft, ToggleRight } from 'lucide-react'

interface MarketRow {
  id: string
  name: string
  state: string
  isActive: boolean
  _count: { properties: number }
}

interface Props {
  markets: MarketRow[]
}

export function MarketsPanel({ markets }: Props) {
  const router = useRouter()
  const [newName, setNewName] = useState('')
  const [newState, setNewState] = useState('TX')
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    try {
      await fetch('/api/markets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), state: newState }),
      })
      setNewName(''); setShowForm(false)
      router.refresh()
    } finally {
      setAdding(false)
    }
  }

  async function toggleActive(market: MarketRow) {
    await fetch(`/api/markets/${market.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !market.isActive }),
    })
    router.refresh()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{markets.length} markets</p>
        <button onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:text-blue-700">
          <Plus className="w-3.5 h-3.5" />
          Add Market
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-slate-50">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Market name" required
            className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <input value={newState} onChange={(e) => setNewState(e.target.value)} placeholder="TX" maxLength={2}
            className="w-14 border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase" />
          <button type="submit" disabled={adding || !newName.trim()}
            className="bg-blue-600 text-white text-xs font-semibold rounded px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50">
            {adding ? '…' : 'Add'}
          </button>
          <button type="button" onClick={() => setShowForm(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </form>
      )}

      <div className="divide-y divide-gray-50">
        {markets.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${m.isActive ? 'text-gray-800' : 'text-gray-400'}`}>{m.name}</p>
              <p className="text-[11px] text-gray-400">{m.state} · {m._count.properties} properties</p>
            </div>
            <button onClick={() => toggleActive(m)} className="text-gray-400 hover:text-blue-600 transition-colors" title={m.isActive ? 'Deactivate' : 'Activate'}>
              {m.isActive ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `apps/web/src/components/settings/ProfileForm.tsx`**

```tsx
'use client'

import { useState } from 'react'

interface Props {
  initialName: string
  initialPhone: string
  email: string
}

export function ProfileForm({ initialName, initialPhone, email }: Props) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || undefined }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-md">
      <h3 className="text-[13px] font-semibold text-gray-900 mb-4">Profile</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1">Email</label>
          <input value={email} disabled
            className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1">Full Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 2145550100"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={saving || !name.trim()}
          className="bg-blue-600 text-white text-sm font-medium rounded-lg px-5 py-2 hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/components/settings && git commit -m "feat: add settings UI components (TeamTable, InviteModal, MarketsPanel, ProfileForm)"
```

---

### Task 6: Settings Page

**Files:**
- Replace: `apps/web/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Replace `apps/web/src/app/(app)/settings/page.tsx`**

```tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUserList, getMarketList, getRoleList } from '@/lib/settings'
import { TeamTable } from '@/components/settings/TeamTable'
import { MarketsPanel } from '@/components/settings/MarketsPanel'
import { ProfileForm } from '@/components/settings/ProfileForm'

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

const TABS = [
  { key: 'team', label: 'Team' },
  { key: 'profile', label: 'Profile' },
  { key: 'markets', label: 'Markets' },
]

export default async function SettingsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { tab = 'team' } = await searchParams
  const currentUserId = (session.user as any).id as string

  const [users, markets, roles] = await Promise.all([
    getUserList(),
    getMarketList(),
    getRoleList(),
  ])

  const currentUser = users.find((u) => u.id === currentUserId)

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-5">Manage your team, profile, and markets</p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/settings?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'team' && (
        <TeamTable
          users={users as any}
          roles={roles}
          currentUserId={currentUserId}
        />
      )}

      {tab === 'profile' && (
        <ProfileForm
          initialName={currentUser?.name ?? (session.user?.name ?? '')}
          initialPhone={currentUser?.phone ?? ''}
          email={currentUser?.email ?? (session.user?.email ?? '')}
        />
      )}

      {tab === 'markets' && (
        <MarketsPanel markets={markets as any} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/app/\(app\)/settings/page.tsx && git commit -m "feat: implement Settings page with Team, Profile, and Markets tabs"
```

---

### Task 7: Email Client

**Files:**
- Create: `apps/web/src/lib/email.ts`
- Create: `apps/web/src/components/email/EmailInbox.tsx`
- Create: `apps/web/src/components/email/ComposeEmailModal.tsx`
- Replace: `apps/web/src/app/(app)/email/page.tsx`

- [ ] **Step 1: Create `apps/web/src/lib/email.ts`**

```typescript
import { prisma } from '@/lib/prisma'

export async function getEmailConversations(filter: { page?: number; pageSize?: number } = {}) {
  const { page = 1, pageSize = 25 } = filter

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where: { messages: { some: { channel: 'EMAIL' } } },
      include: {
        property: {
          select: {
            id: true,
            streetAddress: true,
            city: true,
            leadType: true,
            propertyStatus: true,
          },
        },
        _count: {
          select: { messages: { where: { channel: 'EMAIL' } } },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.conversation.count({
      where: { messages: { some: { channel: 'EMAIL' } } },
    }),
  ])

  return { rows, total }
}
```

- [ ] **Step 2: Create `apps/web/src/components/email/EmailInbox.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Mail } from 'lucide-react'

interface EmailRow {
  id: string
  lastMessageAt: Date | string
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
    propertyStatus: string
  }
  _count: { messages: number }
}

interface Props {
  rows: EmailRow[]
  total: number
}

function propertyPath(p: { id: string; leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT' }): string {
  return `/inbox/${p.id}`
}

export function EmailInbox({ rows, total }: Props) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center h-48 gap-2">
        <Mail className="w-8 h-8 text-gray-300" />
        <p className="text-sm text-gray-400">No email conversations yet.</p>
        <p className="text-xs text-gray-400">Use the Compose button to send the first email.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          {total} email thread{total !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="divide-y divide-gray-50">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={propertyPath(row.property)}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center flex-shrink-0">
              <Mail className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {row.property.streetAddress ?? 'No address'}
                {row.property.city ? `, ${row.property.city}` : ''}
              </p>
              <p className="text-[11px] text-gray-400">
                {row._count.messages} email{row._count.messages !== 1 ? 's' : ''} · {' '}
                {formatDistanceToNow(new Date(row.lastMessageAt), { addSuffix: true })}
              </p>
            </div>
            <span className="text-[11px] text-gray-400 bg-purple-50 rounded px-1.5 py-0.5">
              {row.property.leadType === 'DIRECT_TO_SELLER' ? 'DTS' : 'DTA'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `apps/web/src/components/email/ComposeEmailModal.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

interface Property {
  id: string
  streetAddress: string | null
  city: string | null
}

interface Props {
  open: boolean
  onClose: () => void
}

export function ComposeEmailModal({ open, onClose }: Props) {
  const router = useRouter()
  const [properties, setProperties] = useState<Property[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    // Fetch recent active properties for selection
    fetch('/api/leads?pageSize=50')
      .then((r) => r.json())
      .then((data) => setProperties(data.rows ?? []))
      .catch(() => {})
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!propertyId || !body.trim()) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          channel: 'EMAIL',
          direction: 'OUTBOUND',
          body: body.trim(),
          subject: subject.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed to send')
      onClose()
      setPropertyId(''); setSubject(''); setBody('')
      router.refresh()
    } catch {
      setError('Failed to send email. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Compose Email</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Property / Lead *</label>
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.streetAddress ?? 'No address'}{p.city ? `, ${p.city}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Re: Your property at…" />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Message *</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Type your email message…" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !propertyId || !body.trim()}
              className="flex-1 bg-blue-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Sending…' : 'Send Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Replace `apps/web/src/app/(app)/email/page.tsx`**

```tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getEmailConversations } from '@/lib/email'
import { EmailInbox } from '@/components/email/EmailInbox'
import { EmailHeader } from '@/components/email/EmailHeader'

interface PageProps {
  searchParams: Promise<{ page?: string }>
}

export default async function EmailPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const { rows, total } = await getEmailConversations({
    page: sp.page ? parseInt(sp.page) : 1,
  })

  return (
    <div>
      <EmailHeader />
      <EmailInbox rows={rows as any} total={total} />
    </div>
  )
}
```

- [ ] **Step 5: Create `apps/web/src/components/email/EmailHeader.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { ComposeEmailModal } from './ComposeEmailModal'

export function EmailHeader() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Email</h1>
          <p className="text-sm text-gray-500 mt-0.5">Email conversations across all leads</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-blue-700"
        >
          <Pencil className="w-4 h-4" />
          Compose
        </button>
      </div>
      <ComposeEmailModal open={open} onClose={() => setOpen(false)} />
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
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/lib/email.ts apps/web/src/components/email apps/web/src/app/\(app\)/email/page.tsx && git commit -m "feat: implement Email client page with inbox and compose modal"
```

---

### Task 8: List Stacking Query Helpers + Tests

**Files:**
- Create: `apps/web/src/lib/list-stacking.ts`
- Create: `apps/web/src/lib/__tests__/list-stacking.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/lib/__tests__/list-stacking.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    listStackSource: { findMany: vi.fn() },
    property: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { getListSources, getOverlapProperties } from '../list-stacking'

describe('getListSources', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns sources ordered by createdAt desc', async () => {
    vi.mocked(prisma.listStackSource.findMany).mockResolvedValue([
      { id: 's1', name: 'Tax Delinquent Q1', totalImported: 150, tags: [], description: null, createdAt: new Date(), updatedAt: new Date() },
    ] as any)
    const result = await getListSources()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Tax Delinquent Q1')
  })
})

describe('getOverlapProperties', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array when fewer than 2 sources exist', async () => {
    vi.mocked(prisma.listStackSource.findMany).mockResolvedValue([{ id: 's1' }] as any)
    const result = await getOverlapProperties()
    expect(result).toHaveLength(0)
    expect(prisma.property.findMany).not.toHaveBeenCalled()
  })

  it('returns only properties tagged with 2+ list: tags', async () => {
    vi.mocked(prisma.listStackSource.findMany).mockResolvedValue([
      { id: 's1' }, { id: 's2' },
    ] as any)
    vi.mocked(prisma.property.findMany).mockResolvedValue([
      { id: 'p1', streetAddress: '123 Main', tags: ['list:s1', 'list:s2'] },
      { id: 'p2', streetAddress: '456 Oak', tags: ['list:s1'] }, // only 1 list tag — excluded
    ] as any)

    const result = await getOverlapProperties()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p1')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web test run apps/web/src/lib/__tests__/list-stacking.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../list-stacking'`

- [ ] **Step 3: Create `apps/web/src/lib/list-stacking.ts`**

```typescript
import { prisma } from '@/lib/prisma'

export async function getListSources() {
  return prisma.listStackSource.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

export async function getOverlapProperties(limit = 50) {
  const sources = await prisma.listStackSource.findMany({ select: { id: true } })
  if (sources.length < 2) return []

  const allListTags = sources.map((s) => `list:${s.id}`)

  const properties = await prisma.property.findMany({
    where: { tags: { hasSome: allListTags } },
    select: {
      id: true,
      streetAddress: true,
      city: true,
      state: true,
      zip: true,
      tags: true,
      leadType: true,
      propertyStatus: true,
    },
    take: 1000,
  })

  return properties
    .filter((p) => p.tags.filter((t) => t.startsWith('list:')).length >= 2)
    .slice(0, limit)
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web test run apps/web/src/lib/__tests__/list-stacking.test.ts 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/lib/list-stacking.ts apps/web/src/lib/__tests__/list-stacking.test.ts && git commit -m "feat: add list stacking query helpers with tests"
```

---

### Task 9: List Stacking Route Handler + Pages

**Files:**
- Create: `apps/web/src/app/api/list-stacking/route.ts`
- Create: `apps/web/src/app/api/list-stacking/[id]/route.ts`
- Create: `apps/web/src/components/list-stacking/ListSourceTable.tsx`
- Create: `apps/web/src/components/list-stacking/ImportListModal.tsx`
- Create: `apps/web/src/components/list-stacking/OverlapPanel.tsx`
- Create: `apps/web/src/components/list-stacking/ListStackingHeader.tsx`
- Replace: `apps/web/src/app/(app)/list-stacking/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/api/list-stacking/route.ts`**

This handler parses a CSV upload synchronously, creates a `ListStackSource`, and creates `Property` records for each row. It requires a `marketId` to assign imported properties to (passed as form field).

Expected CSV format (header row, then data rows):
```
Address,City,State,Zip,First Name,Last Name,Phone,Email
123 Main St,Dallas,TX,75001,John,Smith,2145550100,john@example.com
```

Column names are detected flexibly by searching for keywords in the header.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getListSources } from '@/lib/list-stacking'

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const header = lines[0].split(',').map((h) => h.replace(/['"]/g, '').trim().toLowerCase())
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.replace(/['"]/g, '').trim())
    return Object.fromEntries(header.map((h, i) => [h, values[i] ?? '']))
  })
}

function findCol(row: Record<string, string>, keywords: string[]): string {
  for (const k of keywords) {
    const found = Object.keys(row).find((key) => key.includes(k))
    if (found) return row[found] ?? ''
  }
  return ''
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sources = await getListSources()
  return NextResponse.json(sources)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const name = (formData.get('name') as string | null)?.trim()
  const marketId = (formData.get('marketId') as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim() || undefined

  if (!file || !name || !marketId) {
    return NextResponse.json({ error: 'file, name, and marketId are required' }, { status: 400 })
  }

  const text = await file.text()
  const rows = parseCSV(text)
  if (rows.length === 0) {
    return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 })
  }

  const source = await prisma.listStackSource.create({
    data: { name, description, totalImported: 0 },
  })

  const listTag = `list:${source.id}`
  const createdById = (session.user as any).id as string
  let imported = 0

  for (const row of rows) {
    const streetAddress = findCol(row, ['address', 'street']) || null
    const city = findCol(row, ['city']) || null
    const state = findCol(row, ['state']) || null
    const zip = findCol(row, ['zip', 'postal']) || null
    const firstName = findCol(row, ['first', 'fname']) || 'Unknown'
    const lastName = findCol(row, ['last', 'lname']) || null
    const phone = findCol(row, ['phone', 'mobile', 'cell']) || null
    const email = findCol(row, ['email']) || null

    // Compute normalized address for duplicate detection
    const normalizedAddress = streetAddress && city && state
      ? `${streetAddress.toLowerCase()}, ${city.toLowerCase()}, ${state.toLowerCase()} ${zip ?? ''}`.trim()
      : null

    // Skip if duplicate address already exists
    if (normalizedAddress) {
      const existing = await prisma.property.findFirst({
        where: { normalizedAddress },
        select: { id: true, tags: true },
      })
      if (existing) {
        // Tag the existing property with this source if not already tagged
        if (!existing.tags.includes(listTag)) {
          await prisma.property.update({
            where: { id: existing.id },
            data: { tags: { push: listTag } },
          })
        }
        imported++
        continue
      }
    }

    // Create new property + primary contact
    try {
      await prisma.property.create({
        data: {
          streetAddress,
          city,
          state,
          zip,
          normalizedAddress,
          leadType: 'DIRECT_TO_SELLER',
          leadStatus: 'ACTIVE',
          propertyStatus: 'LEAD',
          activeLeadStage: 'NEW_LEAD',
          marketId,
          createdById,
          tags: [listTag],
          contacts: {
            create: {
              isPrimary: true,
              contact: {
                create: {
                  type: 'SELLER',
                  firstName,
                  lastName,
                  phone: phone || null,
                  email: email || null,
                },
              },
            },
          },
        },
      })
      imported++
    } catch {
      // Skip rows that fail (e.g., constraint violations)
    }
  }

  await prisma.listStackSource.update({
    where: { id: source.id },
    data: { totalImported: imported },
  })

  return NextResponse.json({ id: source.id, name, imported }, { status: 201 })
}
```

- [ ] **Step 2: Create `apps/web/src/app/api/list-stacking/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.listStackSource.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Create `apps/web/src/components/list-stacking/ListSourceTable.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface ListSource {
  id: string
  name: string
  description: string | null
  totalImported: number
  tags: string[]
  createdAt: Date | string
}

interface Props {
  sources: ListSource[]
}

export function ListSourceTable({ sources }: Props) {
  const router = useRouter()

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete list "${name}"? This does not delete any imported properties.`)) return
    await fetch(`/api/list-stacking/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  if (sources.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-40">
        <p className="text-sm text-gray-400">No lists imported yet — import your first list above.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          {sources.length} list{sources.length !== 1 ? 's' : ''}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {['List Name', 'Description', 'Imported', 'Created', ''].map((h) => (
              <th key={h} className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sources.map((s) => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
              <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{s.description ?? '—'}</td>
              <td className="px-4 py-3 text-gray-700 font-semibold">{s.totalImported.toLocaleString()}</td>
              <td className="px-4 py-3 text-gray-400 text-[11px]">
                {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
              </td>
              <td className="px-4 py-3">
                <button onClick={() => handleDelete(s.id, s.name)} className="text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Create `apps/web/src/components/list-stacking/ImportListModal.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Upload } from 'lucide-react'

interface Market {
  id: string
  name: string
}

interface Props {
  open: boolean
  onClose: () => void
}

export function ImportListModal({ open, onClose }: Props) {
  const router = useRouter()
  const [markets, setMarkets] = useState<Market[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [marketId, setMarketId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; name: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    fetch('/api/markets').then((r) => r.json()).then((data) => {
      setMarkets(data)
      if (data.length > 0) setMarketId(data[0].id)
    }).catch(() => {})
  }, [open])

  function handleClose() {
    onClose()
    setName(''); setDescription(''); setFile(null); setResult(null); setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !name.trim() || !marketId) return
    setImporting(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', name.trim())
      fd.append('marketId', marketId)
      if (description.trim()) fd.append('description', description.trim())

      const res = await fetch('/api/list-stacking', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Import failed')
      }
      const data = await res.json()
      setResult({ imported: data.imported, name: data.name })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Import Lead List</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        {result ? (
          <div className="p-5 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
              <span className="text-2xl">✓</span>
            </div>
            <p className="font-semibold text-gray-900">{result.name}</p>
            <p className="text-sm text-gray-600">{result.imported.toLocaleString()} records imported successfully</p>
            <button onClick={handleClose} className="mt-2 bg-blue-600 text-white text-sm font-medium rounded-lg px-5 py-2 hover:bg-blue-700">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">List Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Tax Delinquent Q2 2026" />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Market *</label>
              <select value={marketId} onChange={(e) => setMarketId(e.target.value)} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional description" />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">CSV File *</label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-blue-300 transition-colors">
                <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" id="csv-upload" required />
                <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center gap-1.5">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-500">{file ? file.name : 'Click to select CSV'}</span>
                  <span className="text-[11px] text-gray-400">Columns: Address, City, State, Zip, First Name, Last Name, Phone, Email</span>
                </label>
              </div>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleClose}
                className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={importing || !name.trim() || !file || !marketId}
                className="flex-1 bg-blue-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50">
                {importing ? 'Importing…' : 'Import List'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `apps/web/src/components/list-stacking/OverlapPanel.tsx`**

```tsx
import Link from 'next/link'

interface OverlapProperty {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  tags: string[]
  leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
  propertyStatus: string
}

interface Props {
  properties: OverlapProperty[]
}

export function OverlapPanel({ properties }: Props) {
  if (properties.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-sm text-gray-400">No overlapping addresses found yet.</p>
        <p className="text-xs text-gray-400 mt-1">Overlaps appear when the same address is imported from 2+ lists.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-amber-50">
        <p className="text-[13px] font-semibold text-amber-800">
          🔥 {properties.length} overlap{properties.length !== 1 ? 's' : ''} — addresses found in multiple lists
        </p>
        <p className="text-[11px] text-amber-600 mt-0.5">These are high-priority leads — target them first.</p>
      </div>
      <div className="divide-y divide-gray-50">
        {properties.map((p) => {
          const listTags = p.tags.filter((t) => t.startsWith('list:'))
          const href = p.leadType === 'DIRECT_TO_SELLER' ? `/leads/dts/${p.id}` : `/leads/dta/${p.id}`
          return (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <Link href={href} className="text-sm font-medium text-blue-600 hover:underline truncate block">
                  {p.streetAddress ?? 'No address'}{p.city ? `, ${p.city}` : ''}{p.state ? `, ${p.state}` : ''}
                </Link>
                <p className="text-[11px] text-gray-400">{p.zip}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[11px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                  {listTags.length} lists
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create `apps/web/src/components/list-stacking/ListStackingHeader.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { ImportListModal } from './ImportListModal'

export function ListStackingHeader() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">List Stacking</h1>
          <p className="text-sm text-gray-500 mt-0.5">Import lead lists and find overlapping addresses</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-blue-700"
        >
          <Upload className="w-4 h-4" />
          Import List
        </button>
      </div>
      <ImportListModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
```

- [ ] **Step 7: Replace `apps/web/src/app/(app)/list-stacking/page.tsx`**

```tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getListSources, getOverlapProperties } from '@/lib/list-stacking'
import { ListStackingHeader } from '@/components/list-stacking/ListStackingHeader'
import { ListSourceTable } from '@/components/list-stacking/ListSourceTable'
import { OverlapPanel } from '@/components/list-stacking/OverlapPanel'

export default async function ListStackingPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const [sources, overlaps] = await Promise.all([
    getListSources(),
    getOverlapProperties(100),
  ])

  return (
    <div>
      <ListStackingHeader />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <ListSourceTable sources={sources as any} />
        </div>
        <div>
          <OverlapPanel properties={overlaps as any} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1
```

Expected: Zero errors. If you see issues with the `PropertyContact` nested create in the import route, check the relation name from the Property model — it uses `contacts` (relation to `PropertyContact`) with `contact { create: { ... } }`.

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/app/api/list-stacking apps/web/src/components/list-stacking apps/web/src/app/\(app\)/list-stacking/page.tsx && git commit -m "feat: implement List Stacking with CSV import, overlap detection, and source management"
```

---

### Task 10: Build Verification

- [ ] **Step 1: Run all tests**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web test run 2>&1
```

Expected: All tests pass (~46 total: 41 from Phase 5 + 2 analytics + 3 settings + 3 list-stacking). Zero failures.

If any fail, read the failing test file and source file, fix the mismatch, and re-run.

- [ ] **Step 2: Full TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1
```

Expected: Zero errors. Common fixes:
- `params`/`searchParams` must be `await`-ed in Next.js 15 pages
- `(session.user as any).id` for user ID access
- `as any` casts on complex Prisma return types where shape inference is wrong
- `PropertyContact` nested create: use `contacts: { create: { isPrimary: true, contact: { create: { ... } } } }`

- [ ] **Step 3: Production build**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web build 2>&1
```

Expected: Build succeeds. All 4 previously-stubbed routes now real:
- `/analytics` — KPI dashboard
- `/settings` — Team / Profile / Markets tabs
- `/email` — Email conversations
- `/list-stacking` — CSV import + overlap detection

- [ ] **Step 4: Commit fixes if needed**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add -A && git commit -m "fix: resolve Phase 6 build and type errors"
```

---

## Summary

**What Phase 6 delivers:**
- **Analytics** (`/analytics`) — 5 KPI cards (Active Leads, New This Month, In TM, Sold YTD, Revenue YTD), 8-week bar chart, pipeline funnel by stage, exit strategy breakdown with progress bars
- **Settings** (`/settings`) — Tabbed UI: Team tab (user list + deactivate + invite modal), Profile tab (edit own name/phone), Markets tab (list + add + toggle active)
- **Email Client** (`/email`) — Filtered view of email-channel conversations with link-through to full inbox threads; Compose modal creates outbound EMAIL messages on any property
- **List Stacking** (`/list-stacking`) — CSV upload (Address/City/State/Zip/Name/Phone/Email), creates `ListStackSource` + imports `Property` records with dedup by normalizedAddress, tags imported properties with `list:<sourceId>`, overlap panel highlights addresses in 2+ lists

**What Phase 6 does NOT include:**
- AI features (Lead Summarization, Hot Lead Detection, Conversational AI) → Phase 7
- Twilio SMS / RVM integration → Phase 7
- Drip campaign BullMQ worker execution → Phase 7
- Real email sending (SMTP/SendGrid) → Phase 7
- WebSocket real-time events → Phase 7
