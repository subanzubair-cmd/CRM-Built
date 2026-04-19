# Phase 3A — Post-Acquisition Pipelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three post-acquisition pipelines — Transaction Management (TM), Inventory, and Dispo — so properties can move from Under Contract through to Sold, with stage management, buyer offer tracking, and full activity logging.

**Architecture:** Same pattern as Phase 2 leads pipeline. Server Components query Prisma for list/detail reads. URL search params for filter state. Route Handlers for mutations (stage transitions, promote actions, offer recording). All pipeline transitions go through a dedicated `POST /api/properties/[id]/promote` handler that validates the transition and creates StageHistory + ActivityLog entries. The existing `PATCH /api/leads/[id]` handler is extended to accept the additional pipeline fields needed for TM/Inventory/Dispo management.

**Tech Stack:** Next.js 15 App Router, Prisma 7 (`@crm/database`), Zod, Tailwind CSS 4, Vitest, `date-fns`

---

## Actual Schema Field Names (MEMORIZE THESE — do not assume)

```
Property:
  propertyStatus: PropertyStatus   (LEAD | UNDER_CONTRACT | IN_TM | IN_INVENTORY | IN_DISPO | SOLD | RENTAL | DEAD | WARM | REFERRED)
  tmStage: TmStage?                (NEW_CONTRACT | MARKETING_TO_BUYERS | SHOWING_TO_BUYERS | EVALUATING_OFFERS | ACCEPTED_OFFER | CLEAR_TO_CLOSE)
  inventoryStage: InventoryStage?  (NEW_INVENTORY | GETTING_ESTIMATES | UNDER_REHAB | LISTED_FOR_SALE | UNDER_CONTRACT)
  inDispo: Boolean
  exitStrategy: ExitStrategy?      (WHOLESALE | SELLER_FINANCE | INSTALLMENT | FIX_AND_FLIP | INVENTORY_LATER | RENTAL | TURNKEY)
  contractDate: DateTime?
  soldAt: DateTime?
  askingPrice, offerPrice, arv, repairEstimate: Decimal?

Note: body (NOT content), authorId, authorName
Task: dueAt (NOT dueDate), description (NOT notes)
ActivityLog: detail: Json (NOT description: String)
```

---

## File Map

```
MODIFIED:
  apps/web/src/app/api/leads/[id]/route.ts      ← extend PATCH schema with pipeline fields

NEW — lib & tests:
  apps/web/src/lib/pipelines.ts                 ← getTmList, getInventoryList, getDispoList, getPropertyById
  apps/web/src/lib/__tests__/pipelines.test.ts

NEW — Route Handlers:
  apps/web/src/app/api/properties/[id]/promote/route.ts    ← POST: pipeline transitions
  apps/web/src/app/api/properties/[id]/offers/route.ts     ← POST: record buyer offer
  apps/web/src/app/api/properties/[id]/buyer-matches/route.ts ← POST: add buyer match

NEW — Shared Pipeline Components:
  apps/web/src/components/pipelines/PipelineTable.tsx       ← reusable table for TM/Inventory/Dispo lists
  apps/web/src/components/pipelines/PipelineDetailHeader.tsx ← stage management header
  apps/web/src/components/pipelines/PromoteButton.tsx        ← pipeline transition button + confirm dialog
  apps/web/src/components/pipelines/BuyerMatchCard.tsx       ← buyer match + offer UI for Dispo

NEW — TM Pages:
  apps/web/src/app/(app)/tm/page.tsx            ← replace ComingSoon
  apps/web/src/app/(app)/tm/[id]/page.tsx       ← TM detail

NEW — Inventory Pages:
  apps/web/src/app/(app)/inventory/page.tsx     ← replace ComingSoon
  apps/web/src/app/(app)/inventory/[id]/page.tsx ← Inventory detail

NEW — Dispo Pages:
  apps/web/src/app/(app)/dispo/page.tsx         ← replace ComingSoon
  apps/web/src/app/(app)/dispo/[id]/page.tsx    ← Dispo detail with buyer matches
```

---

### Task 1: Pipeline Query Helpers

**Files:**
- Create: `apps/web/src/lib/pipelines.ts`
- Create: `apps/web/src/lib/__tests__/pipelines.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/__tests__/pipelines.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    property: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getTmList, getInventoryList, getDispoList, getPropertyById } from '@/lib/pipelines'

describe('getTmList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by propertyStatus IN_TM', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getTmList({})

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyStatus: 'IN_TM' }),
      })
    )
  })

  it('returns rows and total', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([{ id: '1' }])
    ;(prisma.property.count as any).mockResolvedValue(1)

    const result = await getTmList({})

    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(1)
  })
})

describe('getInventoryList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by propertyStatus IN_INVENTORY', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getInventoryList({})

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyStatus: 'IN_INVENTORY' }),
      })
    )
  })
})

describe('getDispoList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by inDispo true', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getDispoList({})

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ inDispo: true }),
      })
    )
  })
})

describe('getPropertyById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches with contacts, notes, tasks, buyerMatches', async () => {
    ;(prisma.property.findUnique as any).mockResolvedValue(null)

    await getPropertyById('xyz-789')

    expect(prisma.property.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'xyz-789' },
        include: expect.objectContaining({
          contacts: expect.anything(),
          notes: expect.anything(),
          tasks: expect.anything(),
          buyerMatches: expect.anything(),
        }),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/pipelines.test.ts 2>&1 | tail -15
```
Expected: FAIL — functions not found

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/pipelines.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export interface PipelineFilter {
  search?: string
  assignedToId?: string
  page?: number
  pageSize?: number
}

const PROPERTY_LIST_INCLUDE = {
  contacts: {
    where: { isPrimary: true },
    include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
    take: 1,
  },
  assignedTo: { select: { id: true, name: true } },
  _count: { select: { tasks: { where: { status: 'PENDING' as const } } } },
} satisfies Prisma.PropertyInclude

function buildSearchOr(search: string): Prisma.PropertyWhereInput['OR'] {
  return [
    { normalizedAddress: { contains: search, mode: 'insensitive' } },
    { streetAddress: { contains: search, mode: 'insensitive' } },
    { city: { contains: search, mode: 'insensitive' } },
    {
      contacts: {
        some: {
          contact: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      },
    },
  ]
}

export async function getTmList(filter: PipelineFilter) {
  const { search, assignedToId, page = 1, pageSize = 50 } = filter

  const where: Prisma.PropertyWhereInput = {
    propertyStatus: 'IN_TM',
    ...(assignedToId && { assignedToId }),
    ...(search && { OR: buildSearchOr(search) }),
  }

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: PROPERTY_LIST_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function getInventoryList(filter: PipelineFilter) {
  const { search, assignedToId, page = 1, pageSize = 50 } = filter

  const where: Prisma.PropertyWhereInput = {
    propertyStatus: 'IN_INVENTORY',
    ...(assignedToId && { assignedToId }),
    ...(search && { OR: buildSearchOr(search) }),
  }

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: PROPERTY_LIST_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function getDispoList(filter: PipelineFilter) {
  const { search, assignedToId, page = 1, pageSize = 50 } = filter

  const where: Prisma.PropertyWhereInput = {
    inDispo: true,
    ...(assignedToId && { assignedToId }),
    ...(search && { OR: buildSearchOr(search) }),
  }

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: {
        ...PROPERTY_LIST_INCLUDE,
        _count: {
          select: {
            tasks: { where: { status: 'PENDING' } },
            offers: true,
            buyerMatches: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function getPropertyById(id: string) {
  return prisma.property.findUnique({
    where: { id },
    include: {
      contacts: {
        include: { contact: true },
        orderBy: { isPrimary: 'desc' },
      },
      notes: { orderBy: { createdAt: 'desc' }, take: 50 },
      tasks: {
        include: { assignedTo: { select: { id: true, name: true } } },
        orderBy: { dueAt: 'asc' },
      },
      activityLogs: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
      stageHistory: { orderBy: { createdAt: 'desc' }, take: 20 },
      assignedTo: { select: { id: true, name: true } },
      market: { select: { id: true, name: true } },
      buyerMatches: {
        include: {
          buyer: {
            include: {
              contact: { select: { firstName: true, lastName: true, phone: true, email: true } },
            },
          },
        },
        orderBy: { score: 'desc' },
      },
      offers: {
        include: {
          buyer: {
            include: {
              contact: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
      },
    },
  })
}
```

- [ ] **Step 4: Run tests — confirm 4 PASS**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/pipelines.test.ts 2>&1 | tail -15
```
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/lib/pipelines.ts apps/web/src/lib/__tests__/pipelines.test.ts
git commit -m "feat: add pipeline query helpers (TM, Inventory, Dispo)"
```

---

### Task 2: Extend PATCH Handler + New Route Handlers

**Files:**
- Modify: `apps/web/src/app/api/leads/[id]/route.ts`
- Create: `apps/web/src/app/api/properties/[id]/promote/route.ts`
- Create: `apps/web/src/app/api/properties/[id]/offers/route.ts`

- [ ] **Step 1: Extend the PATCH schema in `/api/leads/[id]/route.ts`**

Read the current file, then add these fields to the `UpdateLeadSchema` object (after `tags: z.array(z.string()).optional()`):

```typescript
  propertyStatus: z.enum(['LEAD','UNDER_CONTRACT','IN_TM','IN_INVENTORY','IN_DISPO','SOLD','RENTAL','DEAD','WARM','REFERRED']).optional(),
  tmStage: z.string().optional(),
  inventoryStage: z.string().optional(),
  inDispo: z.boolean().optional(),
  contractDate: z.string().datetime().nullable().optional(),
  soldAt: z.string().datetime().nullable().optional(),
```

Also update the `existing` query to select the new fields for change detection:
```typescript
  const existing = await prisma.property.findUnique({
    where: { id },
    select: { activeLeadStage: true, leadStatus: true, propertyStatus: true, tmStage: true, inventoryStage: true },
  })
```

And in the `updates` data transformation, convert datetime strings to Date objects:
```typescript
  const updates: Record<string, unknown> = { ...data }
  if (data.contractDate) updates.contractDate = new Date(data.contractDate)
  if (data.soldAt) updates.soldAt = new Date(data.soldAt)
```

Add activity entries for `propertyStatus` and `tmStage` / `inventoryStage` changes (after the existing `leadStatus` check):

```typescript
  if (data.propertyStatus && data.propertyStatus !== existing.propertyStatus) {
    activityEntries.push({
      action: 'PIPELINE_CHANGE',
      detail: `Moved to ${data.propertyStatus} pipeline`,
    })
  }

  if (data.tmStage && data.tmStage !== existing.tmStage) {
    activityEntries.push({
      action: 'STAGE_CHANGE',
      detail: `TM stage changed to ${data.tmStage}`,
    })
  }

  if (data.inventoryStage && data.inventoryStage !== existing.inventoryStage) {
    activityEntries.push({
      action: 'STAGE_CHANGE',
      detail: `Inventory stage changed to ${data.inventoryStage}`,
    })
  }
```

And add StageHistory for tmStage/inventoryStage changes (inside the existing `activityEntries.length > 0` block, alongside the existing activeLeadStage history create):
```typescript
  ...(data.tmStage && data.tmStage !== existing.tmStage && {
    stageHistory: {
      create: {
        pipeline: 'tm',
        fromStage: existing.tmStage ?? undefined,
        toStage: data.tmStage,
        changedById: userId,
        changedByName: userName,
      },
    },
  }),
  ...(data.inventoryStage && data.inventoryStage !== existing.inventoryStage && {
    stageHistory: {
      create: {
        pipeline: 'inventory',
        fromStage: existing.inventoryStage ?? undefined,
        toStage: data.inventoryStage,
        changedById: userId,
        changedByName: userName,
      },
    },
  }),
```

**Note:** Prisma only allows a single nested write per relation in one `update` call. Since we may now have multiple `stageHistory.create` conditions, move them all into one `createMany`:

Replace the entire stageHistory nested write block with:
```typescript
  ...(stageHistoryEntries.length > 0 && {
    stageHistory: {
      createMany: {
        data: stageHistoryEntries,
      },
    },
  }),
```

Where `stageHistoryEntries` is built before the `prisma.property.update` call:
```typescript
  const stageHistoryEntries: Array<{
    pipeline: string; fromStage?: string; toStage: string; changedById: string; changedByName: string
  }> = []

  if (data.activeLeadStage && data.activeLeadStage !== existing.activeLeadStage) {
    stageHistoryEntries.push({ pipeline: 'leads', fromStage: existing.activeLeadStage ?? undefined, toStage: data.activeLeadStage, changedById: userId, changedByName: userName })
  }
  if (data.tmStage && data.tmStage !== existing.tmStage) {
    stageHistoryEntries.push({ pipeline: 'tm', fromStage: existing.tmStage ?? undefined, toStage: data.tmStage, changedById: userId, changedByName: userName })
  }
  if (data.inventoryStage && data.inventoryStage !== existing.inventoryStage) {
    stageHistoryEntries.push({ pipeline: 'inventory', fromStage: existing.inventoryStage ?? undefined, toStage: data.inventoryStage, changedById: userId, changedByName: userName })
  }
```

Here is the complete new version of `/api/leads/[id]/route.ts` to write in full (replacing the old file):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const UpdateLeadSchema = z.object({
  activeLeadStage: z.string().optional(),
  leadStatus: z.enum(['ACTIVE', 'WARM', 'DEAD', 'REFERRED_TO_AGENT']).optional(),
  propertyStatus: z.enum(['LEAD','UNDER_CONTRACT','IN_TM','IN_INVENTORY','IN_DISPO','SOLD','RENTAL','DEAD','WARM','REFERRED']).optional(),
  tmStage: z.string().optional(),
  inventoryStage: z.string().optional(),
  inDispo: z.boolean().optional(),
  contractDate: z.string().datetime().nullable().optional(),
  soldAt: z.string().datetime().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  isHot: z.boolean().optional(),
  isFavorited: z.boolean().optional(),
  askingPrice: z.number().nullable().optional(),
  offerPrice: z.number().nullable().optional(),
  arv: z.number().nullable().optional(),
  repairEstimate: z.number().nullable().optional(),
  exitStrategy: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string
  const userName = session.user.name ?? 'Unknown'

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateLeadSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const existing = await prisma.property.findUnique({
    where: { id },
    select: { activeLeadStage: true, leadStatus: true, propertyStatus: true, tmStage: true, inventoryStage: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data = parsed.data
  const updates: Record<string, unknown> = { ...data }

  // Convert datetime strings to Date objects
  if (data.contractDate) updates.contractDate = new Date(data.contractDate)
  else if (data.contractDate === null) updates.contractDate = null
  if (data.soldAt) updates.soldAt = new Date(data.soldAt)
  else if (data.soldAt === null) updates.soldAt = null

  const activityEntries: Array<{ action: string; detail: string }> = []

  if (data.activeLeadStage && data.activeLeadStage !== existing.activeLeadStage) {
    activityEntries.push({ action: 'STAGE_CHANGE', detail: `Stage changed from ${existing.activeLeadStage ?? 'none'} to ${data.activeLeadStage}` })
  }
  if (data.leadStatus && data.leadStatus !== existing.leadStatus) {
    activityEntries.push({ action: 'STATUS_CHANGE', detail: `Status changed to ${data.leadStatus}` })
  }
  if (data.propertyStatus && data.propertyStatus !== existing.propertyStatus) {
    activityEntries.push({ action: 'PIPELINE_CHANGE', detail: `Moved to ${data.propertyStatus} pipeline` })
  }
  if (data.tmStage && data.tmStage !== existing.tmStage) {
    activityEntries.push({ action: 'STAGE_CHANGE', detail: `TM stage changed to ${data.tmStage}` })
  }
  if (data.inventoryStage && data.inventoryStage !== existing.inventoryStage) {
    activityEntries.push({ action: 'STAGE_CHANGE', detail: `Inventory stage changed to ${data.inventoryStage}` })
  }

  const stageHistoryEntries: Array<{ pipeline: string; fromStage?: string; toStage: string; changedById: string; changedByName: string }> = []

  if (data.activeLeadStage && data.activeLeadStage !== existing.activeLeadStage) {
    stageHistoryEntries.push({ pipeline: 'leads', fromStage: existing.activeLeadStage ?? undefined, toStage: data.activeLeadStage, changedById: userId, changedByName: userName })
  }
  if (data.tmStage && data.tmStage !== existing.tmStage) {
    stageHistoryEntries.push({ pipeline: 'tm', fromStage: existing.tmStage ?? undefined, toStage: data.tmStage, changedById: userId, changedByName: userName })
  }
  if (data.inventoryStage && data.inventoryStage !== existing.inventoryStage) {
    stageHistoryEntries.push({ pipeline: 'inventory', fromStage: existing.inventoryStage ?? undefined, toStage: data.inventoryStage, changedById: userId, changedByName: userName })
  }

  const property = await prisma.property.update({
    where: { id },
    data: {
      ...updates,
      ...(activityEntries.length > 0 && {
        activityLogs: {
          createMany: {
            data: activityEntries.map((e) => ({
              userId,
              action: e.action,
              detail: { description: e.detail },
            })),
          },
        },
      }),
      ...(stageHistoryEntries.length > 0 && {
        stageHistory: {
          createMany: { data: stageHistoryEntries },
        },
      }),
    },
  })

  return NextResponse.json({ success: true, data: property })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const { id } = await params
  await prisma.property.update({
    where: { id },
    data: {
      leadStatus: 'DEAD',
      activityLogs: {
        create: {
          userId,
          action: 'LEAD_DELETED',
          detail: { description: 'Lead marked as dead (soft delete)' },
        },
      },
    },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Create promote Route Handler**

Create `apps/web/src/app/api/properties/[id]/promote/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Legal pipeline transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  LEAD:            ['UNDER_CONTRACT'],
  UNDER_CONTRACT:  ['IN_TM', 'DEAD'],
  IN_TM:           ['IN_INVENTORY', 'IN_DISPO', 'SOLD', 'RENTAL', 'DEAD'],
  IN_INVENTORY:    ['IN_DISPO', 'SOLD', 'RENTAL', 'DEAD'],
  IN_DISPO:        ['SOLD', 'IN_INVENTORY', 'DEAD'],
}

const PromoteSchema = z.object({
  toStatus: z.enum(['UNDER_CONTRACT', 'IN_TM', 'IN_INVENTORY', 'IN_DISPO', 'SOLD', 'RENTAL', 'DEAD']),
  contractDate: z.string().datetime().optional(),
  soldAt: z.string().datetime().optional(),
  exitStrategy: z.string().optional(),
  reason: z.string().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string
  const userName = session.user.name ?? 'Unknown'

  const { id } = await params
  const body = await req.json()
  const parsed = PromoteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const existing = await prisma.property.findUnique({
    where: { id },
    select: { propertyStatus: true, tmStage: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const validNext = VALID_TRANSITIONS[existing.propertyStatus] ?? []
  if (!validNext.includes(parsed.data.toStatus)) {
    return NextResponse.json({
      error: `Cannot transition from ${existing.propertyStatus} to ${parsed.data.toStatus}`,
    }, { status: 422 })
  }

  const { toStatus, contractDate, soldAt, exitStrategy, reason } = parsed.data

  // Set default stage for the target pipeline
  const stageDefaults: Record<string, Record<string, unknown>> = {
    IN_TM:        { tmStage: 'NEW_CONTRACT' },
    IN_INVENTORY: { inventoryStage: 'NEW_INVENTORY' },
    IN_DISPO:     { inDispo: true },
    SOLD:         { soldAt: soldAt ? new Date(soldAt) : new Date(), inDispo: false },
    RENTAL:       { rentalAt: new Date(), inDispo: false },
  }

  const property = await prisma.property.update({
    where: { id },
    data: {
      propertyStatus: toStatus,
      ...(contractDate && { contractDate: new Date(contractDate) }),
      ...(exitStrategy && { exitStrategy: exitStrategy as any }),
      ...(stageDefaults[toStatus] ?? {}),
      activityLogs: {
        create: {
          userId,
          action: 'PIPELINE_CHANGE',
          detail: {
            description: `Promoted to ${toStatus}${reason ? `: ${reason}` : ''}`,
            from: existing.propertyStatus,
            to: toStatus,
          },
        },
      },
      stageHistory: {
        create: {
          pipeline: 'pipeline',
          fromStage: existing.propertyStatus,
          toStage: toStatus,
          changedById: userId,
          changedByName: userName,
          reason,
        },
      },
    },
  })

  return NextResponse.json({ success: true, data: property }, { status: 200 })
}
```

- [ ] **Step 3: Create buyer offer Route Handler**

Create `apps/web/src/app/api/properties/[id]/offers/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CreateOfferSchema = z.object({
  buyerId: z.string().min(1),
  offerAmount: z.number().positive(),
  notes: z.string().optional(),
})

const UpdateOfferStatusSchema = z.object({
  offerId: z.string().min(1),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED']),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const { id } = await params
  const body = await req.json()

  // Check if it's an offer status update or new offer
  const updateParsed = UpdateOfferStatusSchema.safeParse(body)
  if (updateParsed.success) {
    const offer = await prisma.buyerOffer.update({
      where: { id: updateParsed.data.offerId },
      data: {
        status: updateParsed.data.status,
        respondedAt: new Date(),
      },
    })
    // If accepted, promote property to SOLD
    if (updateParsed.data.status === 'ACCEPTED') {
      await prisma.property.update({
        where: { id },
        data: {
          propertyStatus: 'SOLD',
          soldAt: new Date(),
          inDispo: false,
          activityLogs: {
            create: {
              userId,
              action: 'OFFER_ACCEPTED',
              detail: { description: `Offer of $${offer.offerAmount} accepted` },
            },
          },
        },
      })
    }
    return NextResponse.json({ success: true, data: offer })
  }

  const parsed = CreateOfferSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const offer = await prisma.buyerOffer.create({
    data: {
      propertyId: id,
      buyerId: parsed.data.buyerId,
      offerAmount: parsed.data.offerAmount,
      notes: parsed.data.notes,
      status: 'PENDING',
    },
  })

  await prisma.activityLog.create({
    data: {
      propertyId: id,
      userId,
      action: 'OFFER_RECEIVED',
      detail: { description: `Buyer offer of $${parsed.data.offerAmount} recorded` },
    },
  })

  return NextResponse.json({ success: true, data: offer }, { status: 201 })
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | grep "error TS" | head -20
```
Fix any errors in the files you just wrote.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add "apps/web/src/app/api/leads/[id]/route.ts" "apps/web/src/app/api/properties/"
git commit -m "feat: extend PATCH handler + add promote and offer route handlers"
```

---

### Task 3: PipelineTable and PipelineDetailHeader Components

**Files:**
- Create: `apps/web/src/components/pipelines/PipelineTable.tsx`
- Create: `apps/web/src/components/pipelines/PipelineDetailHeader.tsx`
- Create: `apps/web/src/components/pipelines/PromoteButton.tsx`

- [ ] **Step 1: Write PipelineTable**

Create `apps/web/src/components/pipelines/PipelineTable.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'

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
  basePath: string   // e.g. "/tm", "/inventory", "/dispo"
  stageLabel?: (row: PipelineRow) => string | null
  extraColumns?: Array<{ header: string; render: (row: PipelineRow) => React.ReactNode }>
}

const TM_STAGE_LABELS: Record<string, string> = {
  NEW_CONTRACT:       'New Contract',
  MARKETING_TO_BUYERS: 'Marketing',
  SHOWING_TO_BUYERS:  'Showing',
  EVALUATING_OFFERS:  'Evaluating Offers',
  ACCEPTED_OFFER:     'Accepted Offer',
  CLEAR_TO_CLOSE:     'Clear to Close',
}

const TM_STAGE_COLORS: Record<string, string> = {
  NEW_CONTRACT:        'bg-blue-50 text-blue-700',
  MARKETING_TO_BUYERS: 'bg-purple-50 text-purple-700',
  SHOWING_TO_BUYERS:   'bg-yellow-50 text-yellow-700',
  EVALUATING_OFFERS:   'bg-orange-50 text-orange-700',
  ACCEPTED_OFFER:      'bg-emerald-50 text-emerald-700',
  CLEAR_TO_CLOSE:      'bg-green-100 text-green-800',
}

const INV_STAGE_LABELS: Record<string, string> = {
  NEW_INVENTORY:    'New',
  GETTING_ESTIMATES: 'Getting Estimates',
  UNDER_REHAB:      'Under Rehab',
  LISTED_FOR_SALE:  'Listed',
  UNDER_CONTRACT:   'Under Contract',
}

const INV_STAGE_COLORS: Record<string, string> = {
  NEW_INVENTORY:    'bg-gray-100 text-gray-700',
  GETTING_ESTIMATES: 'bg-yellow-50 text-yellow-700',
  UNDER_REHAB:      'bg-orange-50 text-orange-700',
  LISTED_FOR_SALE:  'bg-blue-50 text-blue-700',
  UNDER_CONTRACT:   'bg-green-100 text-green-800',
}

export function PipelineTable({ rows, total, basePath, stageLabel, extraColumns = [] }: Props) {
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
    </div>
  )
}
```

- [ ] **Step 2: Write PipelineDetailHeader**

Create `apps/web/src/components/pipelines/PipelineDetailHeader.tsx`:

```typescript
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, Star } from 'lucide-react'

const TM_STAGES = [
  { value: 'NEW_CONTRACT', label: 'New Contract' },
  { value: 'MARKETING_TO_BUYERS', label: 'Marketing to Buyers' },
  { value: 'SHOWING_TO_BUYERS', label: 'Showing to Buyers' },
  { value: 'EVALUATING_OFFERS', label: 'Evaluating Offers' },
  { value: 'ACCEPTED_OFFER', label: 'Accepted Offer' },
  { value: 'CLEAR_TO_CLOSE', label: 'Clear to Close' },
]

const INVENTORY_STAGES = [
  { value: 'NEW_INVENTORY', label: 'New Inventory' },
  { value: 'GETTING_ESTIMATES', label: 'Getting Estimates' },
  { value: 'UNDER_REHAB', label: 'Under Rehab' },
  { value: 'LISTED_FOR_SALE', label: 'Listed for Sale' },
  { value: 'UNDER_CONTRACT', label: 'Under Contract' },
]

interface Props {
  id: string
  pipeline: 'tm' | 'inventory' | 'dispo'
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  propertyStatus: string
  tmStage: string | null
  inventoryStage: string | null
  isHot: boolean
  isFavorited: boolean
  contractDate: Date | null
  source: string | null
  createdAt: Date
}

export function PipelineDetailHeader({
  id, pipeline, streetAddress, city, state, zip,
  propertyStatus, tmStage, inventoryStage, isHot, isFavorited,
  contractDate, source, createdAt,
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
            Added {new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {contractDate && (
              <> · Contract: {new Date(contractDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {pipeline === 'tm' && (
            <select
              value={tmStage ?? ''}
              onChange={(e) => patch({ tmStage: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm h-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="" disabled>Set TM stage</option>
              {TM_STAGES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          )}

          {pipeline === 'inventory' && (
            <select
              value={inventoryStage ?? ''}
              onChange={(e) => patch({ inventoryStage: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm h-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="" disabled>Set Inventory stage</option>
              {INVENTORY_STAGES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          )}

          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
            propertyStatus === 'IN_TM' ? 'bg-blue-100 text-blue-700' :
            propertyStatus === 'IN_INVENTORY' ? 'bg-orange-100 text-orange-700' :
            propertyStatus === 'IN_DISPO' ? 'bg-purple-100 text-purple-700' :
            propertyStatus === 'SOLD' ? 'bg-green-100 text-green-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {propertyStatus.replace(/_/g, ' ')}
          </span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write PromoteButton**

Create `apps/web/src/components/pipelines/PromoteButton.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

interface PromoteOption {
  toStatus: string
  label: string
  color: string
}

interface Props {
  propertyId: string
  options: PromoteOption[]
  onPromoted?: (toStatus: string) => void
}

export function PromoteButton({ propertyId, options, onPromoted }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function promote(toStatus: string) {
    setError(null)
    const res = await fetch(`/api/properties/${propertyId}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toStatus }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Failed')
      return
    }
    onPromoted?.(toStatus)
    startTransition(() => router.refresh())
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
        <ArrowRight className="w-4 h-4" />
        Move To
      </h3>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="flex flex-col gap-2">
        {options.map((opt) => (
          <button
            key={opt.toStatus}
            onClick={() => promote(opt.toStatus)}
            disabled={isPending}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${opt.color}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write BuyerMatchCard**

Create `apps/web/src/components/pipelines/BuyerMatchCard.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { DollarSign, Phone } from 'lucide-react'

interface BuyerOfferRow {
  id: string
  offerAmount: number | string
  status: string
  notes: string | null
  submittedAt: Date
  buyer: {
    contact: { firstName: string; lastName: string | null }
  }
}

interface BuyerMatchRow {
  id: string
  score: number
  buyer: {
    id: string
    contact: { firstName: string; lastName: string | null; phone: string | null; email: string | null }
  }
}

interface Props {
  propertyId: string
  buyerMatches: BuyerMatchRow[]
  offers: BuyerOfferRow[]
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:   'bg-yellow-50 text-yellow-700',
  ACCEPTED:  'bg-green-100 text-green-700',
  REJECTED:  'bg-red-50 text-red-700',
  COUNTERED: 'bg-blue-50 text-blue-700',
}

export function BuyerMatchCard({ propertyId, buyerMatches, offers }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [selectedBuyerId, setSelectedBuyerId] = useState('')
  const [offerAmount, setOfferAmount] = useState('')

  async function recordOffer() {
    if (!selectedBuyerId || !offerAmount) return
    await fetch(`/api/properties/${propertyId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerId: selectedBuyerId, offerAmount: parseFloat(offerAmount) }),
    })
    setShowOfferForm(false)
    setSelectedBuyerId('')
    setOfferAmount('')
    startTransition(() => router.refresh())
  }

  async function updateOfferStatus(offerId: string, status: string) {
    await fetch(`/api/properties/${propertyId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offerId, status }),
    })
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-4">
      {/* Offers */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <DollarSign className="w-4 h-4" />
            Offers <span className="text-gray-400 font-normal">({offers.length})</span>
          </h3>
          <button
            onClick={() => setShowOfferForm(!showOfferForm)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            + Record Offer
          </button>
        </div>

        {showOfferForm && (
          <div className="mb-3 border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Buyer</label>
              <select
                value={selectedBuyerId}
                onChange={(e) => setSelectedBuyerId(e.target.value)}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm"
              >
                <option value="">Select buyer...</option>
                {buyerMatches.map((m) => (
                  <option key={m.buyer.id} value={m.buyer.id}>
                    {m.buyer.contact.firstName} {m.buyer.contact.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Offer Amount ($)</label>
              <input
                type="number"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                placeholder="150000"
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={recordOffer}
                disabled={isPending || !selectedBuyerId || !offerAmount}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Save
              </button>
              <button onClick={() => setShowOfferForm(false)} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded">
                Cancel
              </button>
            </div>
          </div>
        )}

        {offers.length === 0 ? (
          <p className="text-sm text-gray-400">No offers yet</p>
        ) : (
          <div className="space-y-2">
            {offers.map((offer) => (
              <div key={offer.id} className="flex items-center justify-between p-2 border border-gray-100 rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    ${Number(offer.offerAmount).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {offer.buyer.contact.firstName} {offer.buyer.contact.lastName}
                    {' · '}{formatDistanceToNow(new Date(offer.submittedAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[offer.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {offer.status}
                  </span>
                  {offer.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => updateOfferStatus(offer.id, 'ACCEPTED')}
                        className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => updateOfferStatus(offer.id, 'REJECTED')}
                        className="text-[11px] text-red-600 hover:text-red-800 font-medium"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Buyer Matches */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
          <Phone className="w-4 h-4" />
          Buyer Matches <span className="text-gray-400 font-normal">({buyerMatches.length})</span>
        </h3>
        {buyerMatches.length === 0 ? (
          <p className="text-sm text-gray-400">No buyer matches</p>
        ) : (
          <div className="space-y-2">
            {buyerMatches.map((match) => (
              <div key={match.id} className="flex items-center justify-between p-2 border border-gray-100 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {match.buyer.contact.firstName} {match.buyer.contact.lastName}
                  </p>
                  <p className="text-[11px] text-gray-400">{match.buyer.contact.phone ?? 'No phone'}</p>
                </div>
                <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  Score: {match.score}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | grep "error TS" | head -20
```
Fix any errors in the files you just wrote.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/components/pipelines/
git commit -m "feat: add PipelineTable, PipelineDetailHeader, PromoteButton, BuyerMatchCard"
```

---

### Task 4: TM Pipeline Pages

**Files:**
- Modify: `apps/web/src/app/(app)/tm/page.tsx`
- Create: `apps/web/src/app/(app)/tm/[id]/page.tsx`

- [ ] **Step 1: Write TM list page**

Replace `apps/web/src/app/(app)/tm/page.tsx`:

```typescript
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
  const [{ rows, total }, users] = await Promise.all([
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
      <PipelineTable rows={rows as any} total={total} basePath="/tm" />
    </div>
  )
}
```

- [ ] **Step 2: Write TM detail page**

Create `apps/web/src/app/(app)/tm/[id]/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getPropertyById } from '@/lib/pipelines'
import { PipelineDetailHeader } from '@/components/pipelines/PipelineDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { NotesCard } from '@/components/leads/NotesCard'
import { TasksCard } from '@/components/leads/TasksCard'
import { PromoteButton } from '@/components/pipelines/PromoteButton'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type Params = { params: Promise<{ id: string }> }

export default async function TmDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const property = await getPropertyById(id)
  if (!property) notFound()

  const promoteOptions = [
    { toStatus: 'IN_INVENTORY', label: 'Move to Inventory', color: 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200' },
    { toStatus: 'IN_DISPO', label: 'Move to Dispo', color: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200' },
    { toStatus: 'SOLD', label: 'Mark as Sold', color: 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200' },
    { toStatus: 'DEAD', label: 'Cancel / Dead', color: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200' },
  ]

  return (
    <div>
      <Link href="/tm" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
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

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <ContactsCard contacts={property.contacts as any} />
          <NotesCard propertyId={property.id} notes={property.notes as any} />
        </div>
        <div className="space-y-4">
          <PromoteButton propertyId={property.id} options={promoteOptions} />
          <TasksCard propertyId={property.id} tasks={property.tasks as any} />
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

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add "apps/web/src/app/(app)/tm/"
git commit -m "feat: implement TM pipeline list and detail pages"
```

---

### Task 5: Inventory Pipeline Pages

**Files:**
- Modify: `apps/web/src/app/(app)/inventory/page.tsx`
- Create: `apps/web/src/app/(app)/inventory/[id]/page.tsx`

- [ ] **Step 1: Write Inventory list page**

Replace `apps/web/src/app/(app)/inventory/page.tsx`:

```typescript
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
  const [{ rows, total }, users] = await Promise.all([
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
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Properties in rehab or listed for sale</p>
      <Suspense fallback={<div className="h-8 mb-3" />}>
        <LeadFilters users={users} showStageFilter={false} />
      </Suspense>
      <PipelineTable rows={rows as any} total={total} basePath="/inventory" />
    </div>
  )
}
```

- [ ] **Step 2: Write Inventory detail page**

Create `apps/web/src/app/(app)/inventory/[id]/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getPropertyById } from '@/lib/pipelines'
import { PipelineDetailHeader } from '@/components/pipelines/PipelineDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { NotesCard } from '@/components/leads/NotesCard'
import { TasksCard } from '@/components/leads/TasksCard'
import { PromoteButton } from '@/components/pipelines/PromoteButton'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type Params = { params: Promise<{ id: string }> }

export default async function InventoryDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const property = await getPropertyById(id)
  if (!property) notFound()

  const promoteOptions = [
    { toStatus: 'IN_DISPO', label: 'Move to Dispo', color: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200' },
    { toStatus: 'SOLD', label: 'Mark as Sold', color: 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200' },
    { toStatus: 'RENTAL', label: 'Convert to Rental', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200' },
    { toStatus: 'DEAD', label: 'Remove / Dead', color: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200' },
  ]

  return (
    <div>
      <Link href="/inventory" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
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

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <ContactsCard contacts={property.contacts as any} />
          <NotesCard propertyId={property.id} notes={property.notes as any} />
        </div>
        <div className="space-y-4">
          <PromoteButton propertyId={property.id} options={promoteOptions} />
          <TasksCard propertyId={property.id} tasks={property.tasks as any} />
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

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add "apps/web/src/app/(app)/inventory/"
git commit -m "feat: implement Inventory pipeline list and detail pages"
```

---

### Task 6: Dispo Pipeline Pages

**Files:**
- Modify: `apps/web/src/app/(app)/dispo/page.tsx`
- Create: `apps/web/src/app/(app)/dispo/[id]/page.tsx`

- [ ] **Step 1: Write Dispo list page**

Replace `apps/web/src/app/(app)/dispo/page.tsx`:

```typescript
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
  const [{ rows, total }, users] = await Promise.all([
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

- [ ] **Step 2: Write Dispo detail page**

Create `apps/web/src/app/(app)/dispo/[id]/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getPropertyById } from '@/lib/pipelines'
import { PipelineDetailHeader } from '@/components/pipelines/PipelineDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { NotesCard } from '@/components/leads/NotesCard'
import { TasksCard } from '@/components/leads/TasksCard'
import { PromoteButton } from '@/components/pipelines/PromoteButton'
import { BuyerMatchCard } from '@/components/pipelines/BuyerMatchCard'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type Params = { params: Promise<{ id: string }> }

export default async function DispoDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const property = await getPropertyById(id)
  if (!property) notFound()

  const promoteOptions = [
    { toStatus: 'SOLD', label: 'Mark as Sold', color: 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200' },
    { toStatus: 'IN_INVENTORY', label: 'Move to Inventory', color: 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200' },
    { toStatus: 'DEAD', label: 'Remove / Dead', color: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200' },
  ]

  return (
    <div>
      <Link href="/dispo" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
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

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <BuyerMatchCard
            propertyId={property.id}
            buyerMatches={property.buyerMatches as any}
            offers={property.offers as any}
          />
          <ContactsCard contacts={property.contacts as any} />
          <NotesCard propertyId={property.id} notes={property.notes as any} />
        </div>
        <div className="space-y-4">
          <PromoteButton propertyId={property.id} options={promoteOptions} />
          <TasksCard propertyId={property.id} tasks={property.tasks as any} />
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

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add "apps/web/src/app/(app)/dispo/"
git commit -m "feat: implement Dispo pipeline list and detail pages with buyer matching"
```

---

### Task 7: Build Verification

**Files:** None created — verification only

- [ ] **Step 1: Run all tests**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run 2>&1 | tail -20
PATH=/c/node-x64:$PATH pnpm --filter @crm/shared exec vitest run 2>&1 | tail -10
PATH=/c/node-x64:$PATH pnpm --filter @crm/api exec vitest run 2>&1 | tail -10
```
Expected: All 28 tests passing (24 existing + 4 new pipeline helpers)

- [ ] **Step 2: Full TypeScript build check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | grep "error TS" | head -30
```
Expected: No errors in Phase 3A files

- [ ] **Step 3: Next.js build check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web"
PATH=/c/node-x64:$PATH /c/node-x64/node.exe node_modules/.bin/next build 2>&1 | tail -30
```
Expected: Build succeeds, new TM/Inventory/Dispo routes appear in route list

- [ ] **Step 4: Final commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add -A
git commit -m "feat: Phase 3A complete — TM, Inventory, Dispo pipelines"
```

---

## Summary

**What Phase 3A delivers:**
- TM pipeline (list + detail) with stage management (NEW_CONTRACT → CLEAR_TO_CLOSE)
- Inventory pipeline (list + detail) with rehab stage tracking
- Dispo pipeline (list + detail) with buyer match list and offer recording
- Pipeline promotion system: legally-validated transitions between all pipeline states
- Extended PATCH handler supporting all pipeline fields
- Buyer offer accept/reject with automatic property promotion to SOLD

**What Phase 3A does NOT include:**
- Real SMS/Twilio outbound → Phase 3B
- Calendar appointments → Phase 3B
- Buyer/Vendor management pages → Phase 4
- Sold/Rental archive pages → Phase 4
