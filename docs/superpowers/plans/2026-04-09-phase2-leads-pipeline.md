# Phase 2 — Leads Acquisition Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete leads acquisition pipeline — all five lead list views with real data and filtering, the lead detail page with contacts/notes/tasks/stage management, an "Add Lead" modal, a live dashboard, and the global Tasks and Activity pages.

**Architecture:** Server Components query Prisma directly for all list and detail pages (no API roundtrip for reads). URL search params carry filter state so views are bookmarkable and shareable. Client Components own filter UI, modals, and forms. Mutations go through Next.js Route Handlers; every mutation ends with `router.refresh()` to reload the nearest Server Component tree. The Express API is **not** used in Phase 2 — all web data flows through Next.js Route Handlers.

**Tech Stack:** Next.js 15 App Router, Prisma 7 (`@crm/database`), Zod (validation), shadcn/ui, Tailwind CSS 4, Vitest (unit tests), `@crm/shared` utilities

---

## File Map

```
NEW — lib & shared queries
  apps/web/src/lib/leads.ts              ← typed Prisma query helpers for lead lists
  apps/web/src/lib/tasks.ts             ← typed Prisma query helpers for tasks
  apps/web/src/lib/activity.ts          ← typed Prisma query helpers for activity logs

NEW — Route Handlers (mutations)
  apps/web/src/app/api/leads/route.ts                    ← POST /api/leads (create)
  apps/web/src/app/api/leads/[id]/route.ts               ← PATCH /api/leads/[id] (update stage/fields), DELETE
  apps/web/src/app/api/leads/[id]/contacts/route.ts      ← POST (add contact)
  apps/web/src/app/api/leads/[id]/notes/route.ts         ← POST (add note)
  apps/web/src/app/api/leads/[id]/tasks/route.ts         ← POST (add task)
  apps/web/src/app/api/tasks/[id]/route.ts               ← PATCH (complete/cancel task)

NEW — Lead list pages (Server Components)
  apps/web/src/app/(app)/leads/dts/page.tsx              ← replace ComingSoon
  apps/web/src/app/(app)/leads/dta/page.tsx              ← replace ComingSoon
  apps/web/src/app/(app)/leads/warm/page.tsx             ← replace ComingSoon
  apps/web/src/app/(app)/leads/dead/page.tsx             ← replace ComingSoon
  apps/web/src/app/(app)/leads/referred/page.tsx         ← replace ComingSoon

NEW — Lead detail pages (Server + Client mix)
  apps/web/src/app/(app)/leads/dts/[id]/page.tsx
  apps/web/src/app/(app)/leads/dta/[id]/page.tsx

NEW — Shared UI components
  apps/web/src/components/leads/LeadTable.tsx            ← Client: sortable table with row clicks
  apps/web/src/components/leads/LeadFilters.tsx          ← Client: filter bar (search, stage, assignee, date)
  apps/web/src/components/leads/AddLeadModal.tsx         ← Client: "Add Lead" form modal
  apps/web/src/components/leads/LeadDetailHeader.tsx     ← Client: property info + stage selector
  apps/web/src/components/leads/ContactsCard.tsx         ← Client: contacts list + add contact
  apps/web/src/components/leads/NotesCard.tsx            ← Client: notes feed + add note
  apps/web/src/components/leads/TasksCard.tsx            ← Client: tasks list + add task
  apps/web/src/components/leads/ActivityCard.tsx         ← Server Component: activity log
  apps/web/src/components/tasks/TaskTable.tsx            ← Client: global task table
  apps/web/src/components/dashboard/StatCard.tsx         ← Server: single metric card

MODIFIED
  apps/web/src/app/(app)/dashboard/page.tsx              ← wire real counts
  apps/web/src/app/(app)/tasks/page.tsx                  ← replace ComingSoon
  apps/web/src/app/(app)/activity/page.tsx               ← replace ComingSoon
  apps/web/src/components/layout/GlobalHeader.tsx        ← wire "+ Add" button → AddLeadModal

NEW — Tests
  apps/web/src/lib/__tests__/leads.test.ts
  apps/web/src/lib/__tests__/tasks.test.ts
```

---

### Task 1: Lead Query Helpers

**Files:**
- Create: `apps/web/src/lib/leads.ts`
- Create: `apps/web/src/lib/__tests__/leads.test.ts`

These are pure functions that wrap Prisma calls with typed filters. Having them in one file makes them easy to test with mocked Prisma and easy to reuse across Server Components.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/__tests__/leads.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the prisma singleton before importing the module under test
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
import {
  getLeadList,
  getLeadById,
  LeadListFilter,
} from '@/lib/leads'

describe('getLeadList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by leadType DIRECT_TO_SELLER and status ACTIVE for DTS', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getLeadList({ pipeline: 'dts' })

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadType: 'DIRECT_TO_SELLER',
          leadStatus: 'ACTIVE',
        }),
      })
    )
  })

  it('filters by leadType DIRECT_TO_AGENT and status ACTIVE for DTA', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getLeadList({ pipeline: 'dta' })

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadType: 'DIRECT_TO_AGENT',
          leadStatus: 'ACTIVE',
        }),
      })
    )
  })

  it('applies optional search filter to normalizedAddress and contact name', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([])
    ;(prisma.property.count as any).mockResolvedValue(0)

    await getLeadList({ pipeline: 'dts', search: 'Dallas' })

    const call = (prisma.property.findMany as any).mock.calls[0][0]
    expect(call.where.OR).toBeDefined()
  })

  it('returns total count alongside rows', async () => {
    ;(prisma.property.findMany as any).mockResolvedValue([{ id: '1' }])
    ;(prisma.property.count as any).mockResolvedValue(1)

    const result = await getLeadList({ pipeline: 'dts' })

    expect(result.total).toBe(1)
    expect(result.rows).toHaveLength(1)
  })
})

describe('getLeadById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches property with contacts, notes, tasks, and activity', async () => {
    ;(prisma.property.findUnique as any).mockResolvedValue(null)

    await getLeadById('abc-123')

    expect(prisma.property.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'abc-123' },
        include: expect.objectContaining({
          contacts: expect.anything(),
          notes: expect.anything(),
          tasks: expect.anything(),
          activityLogs: expect.anything(),
        }),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/leads.test.ts 2>&1 | tail -20
```
Expected: FAIL — `getLeadList` not found

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/leads.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { LeadType, LeadStatus, Prisma } from '@crm/database'

export type LeadPipeline = 'dts' | 'dta' | 'warm' | 'dead' | 'referred'

export interface LeadListFilter {
  pipeline: LeadPipeline
  search?: string
  stage?: string
  assignedToId?: string
  marketId?: string
  isHot?: boolean
  page?: number
  pageSize?: number
}

const PIPELINE_WHERE: Record<LeadPipeline, Prisma.PropertyWhereInput> = {
  dts: { leadType: LeadType.DIRECT_TO_SELLER, leadStatus: LeadStatus.ACTIVE },
  dta: { leadType: LeadType.DIRECT_TO_AGENT, leadStatus: LeadStatus.ACTIVE },
  warm: { leadStatus: LeadStatus.WARM },
  dead: { leadStatus: LeadStatus.DEAD },
  referred: { leadStatus: LeadStatus.REFERRED_TO_AGENT },
}

export async function getLeadList(filter: LeadListFilter) {
  const { pipeline, search, stage, assignedToId, marketId, isHot, page = 1, pageSize = 50 } = filter
  const base = PIPELINE_WHERE[pipeline]

  const where: Prisma.PropertyWhereInput = {
    ...base,
    ...(stage && { activeLeadStage: stage as any }),
    ...(assignedToId && { assignedToId }),
    ...(marketId && { marketId }),
    ...(isHot && { isHot: true }),
    ...(search && {
      OR: [
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
                  { phone: { contains: search, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ],
    }),
  }

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: {
        contacts: {
          where: { isPrimary: true },
          include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
          take: 1,
        },
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { tasks: { where: { status: 'PENDING' } } } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function getLeadById(id: string) {
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
        orderBy: { dueDate: 'asc' },
      },
      activityLogs: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
      stageHistory: { orderBy: { createdAt: 'desc' }, take: 20 },
      assignedTo: { select: { id: true, name: true } },
      market: { select: { id: true, name: true } },
    },
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/leads.test.ts 2>&1 | tail -20
```
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/lib/leads.ts apps/web/src/lib/__tests__/leads.test.ts
git commit -m "feat: add lead query helpers with tests"
```

---

### Task 2: Task & Activity Query Helpers

**Files:**
- Create: `apps/web/src/lib/tasks.ts`
- Create: `apps/web/src/lib/activity.ts`
- Create: `apps/web/src/lib/__tests__/tasks.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/__tests__/tasks.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    activityLog: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getTaskList } from '@/lib/tasks'
import { getActivityFeed } from '@/lib/activity'

describe('getTaskList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches PENDING tasks by default', async () => {
    ;(prisma.task.findMany as any).mockResolvedValue([])
    ;(prisma.task.count as any).mockResolvedValue(0)

    await getTaskList({})

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
      })
    )
  })

  it('filters by assignedToId when provided', async () => {
    ;(prisma.task.findMany as any).mockResolvedValue([])
    ;(prisma.task.count as any).mockResolvedValue(0)

    await getTaskList({ assignedToId: 'user-1' })

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assignedToId: 'user-1' }),
      })
    )
  })

  it('filters overdue tasks when overdue flag is set', async () => {
    ;(prisma.task.findMany as any).mockResolvedValue([])
    ;(prisma.task.count as any).mockResolvedValue(0)

    await getTaskList({ overdue: true })

    const call = (prisma.task.findMany as any).mock.calls[0][0]
    expect(call.where.dueDate).toBeDefined()
  })
})

describe('getActivityFeed', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches activity logs with user info', async () => {
    ;(prisma.activityLog.findMany as any).mockResolvedValue([])

    await getActivityFeed({})

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          user: expect.anything(),
        }),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/tasks.test.ts 2>&1 | tail -20
```
Expected: FAIL

- [ ] **Step 3: Write the implementations**

Create `apps/web/src/lib/tasks.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export interface TaskListFilter {
  assignedToId?: string
  propertyId?: string
  overdue?: boolean
  dueToday?: boolean
  page?: number
  pageSize?: number
}

export async function getTaskList(filter: TaskListFilter) {
  const { assignedToId, propertyId, overdue, dueToday, page = 1, pageSize = 50 } = filter

  const now = new Date()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)

  const where: Prisma.TaskWhereInput = {
    status: 'PENDING',
    ...(assignedToId && { assignedToId }),
    ...(propertyId && { propertyId }),
    ...(overdue && { dueDate: { lt: todayStart } }),
    ...(dueToday && { dueDate: { gte: todayStart, lte: todayEnd } }),
  }

  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true } },
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
      orderBy: { dueDate: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.task.count({ where }),
  ])

  return { rows, total, page, pageSize }
}
```

Create `apps/web/src/lib/activity.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export interface ActivityFeedFilter {
  propertyId?: string
  userId?: string
  page?: number
  pageSize?: number
}

export async function getActivityFeed(filter: ActivityFeedFilter) {
  const { propertyId, userId, page = 1, pageSize = 50 } = filter

  const where: Prisma.ActivityLogWhereInput = {
    ...(propertyId && { propertyId }),
    ...(userId && { userId }),
  }

  return prisma.activityLog.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
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
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/tasks.test.ts 2>&1 | tail -20
```
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/lib/tasks.ts apps/web/src/lib/activity.ts apps/web/src/lib/__tests__/tasks.test.ts
git commit -m "feat: add task and activity query helpers with tests"
```

---

### Task 3: Route Handlers — Lead Mutations

**Files:**
- Create: `apps/web/src/app/api/leads/route.ts`
- Create: `apps/web/src/app/api/leads/[id]/route.ts`
- Create: `apps/web/src/app/api/leads/[id]/notes/route.ts`
- Create: `apps/web/src/app/api/leads/[id]/tasks/route.ts`
- Create: `apps/web/src/app/api/tasks/[id]/route.ts`

These Route Handlers are called by Client Component forms. All require the session. All return `{ success: true, data }` or `{ error: string }`.

- [ ] **Step 1: Write the implementation — POST /api/leads (create)**

Create `apps/web/src/app/api/leads/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { normalizeAddress } from '@crm/shared'

const CreateLeadSchema = z.object({
  streetAddress: z.string().min(1),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  leadType: z.enum(['DIRECT_TO_SELLER', 'DIRECT_TO_AGENT']),
  marketId: z.string().min(1),
  source: z.string().optional(),
  assignedToId: z.string().optional(),
  contactFirstName: z.string().optional(),
  contactLastName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateLeadSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { contactFirstName, contactLastName, contactPhone, contactEmail, ...propertyData } = parsed.data

  const normalized = normalizeAddress({
    street: propertyData.streetAddress,
    city: propertyData.city,
    state: propertyData.state,
    zip: propertyData.zip,
  })

  const property = await prisma.property.create({
    data: {
      ...propertyData,
      normalizedAddress: normalized,
      createdById: session.user.id,
      activeLeadStage: 'NEW_LEAD',
      stageHistory: {
        create: {
          pipeline: 'leads',
          toStage: 'NEW_LEAD',
          changedById: session.user.id,
          changedByName: session.user.name ?? 'Unknown',
        },
      },
      activityLogs: {
        create: {
          userId: session.user.id,
          action: 'LEAD_CREATED',
          description: `Lead created from ${propertyData.source ?? 'manual entry'}`,
        },
      },
      ...(contactFirstName && {
        contacts: {
          create: {
            isPrimary: true,
            contact: {
              create: {
                type: propertyData.leadType === 'DIRECT_TO_SELLER' ? 'SELLER' : 'AGENT',
                firstName: contactFirstName,
                lastName: contactLastName ?? '',
                phone: contactPhone,
                email: contactEmail,
              },
            },
          },
        },
      }),
    },
  })

  return NextResponse.json({ success: true, data: property }, { status: 201 })
}
```

- [ ] **Step 2: Write the implementation — PATCH & DELETE /api/leads/[id]**

Create `apps/web/src/app/api/leads/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const UpdateLeadSchema = z.object({
  activeLeadStage: z.string().optional(),
  leadStatus: z.enum(['ACTIVE', 'WARM', 'DEAD', 'REFERRED_TO_AGENT']).optional(),
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

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateLeadSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const existing = await prisma.property.findUnique({ where: { id }, select: { activeLeadStage: true, leadStatus: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data = parsed.data
  const updates: Record<string, unknown> = { ...data }

  const activityEntries: Array<{ action: string; description: string }> = []

  if (data.activeLeadStage && data.activeLeadStage !== existing.activeLeadStage) {
    activityEntries.push({
      action: 'STAGE_CHANGE',
      description: `Stage changed from ${existing.activeLeadStage ?? 'none'} to ${data.activeLeadStage}`,
    })
  }

  if (data.leadStatus && data.leadStatus !== existing.leadStatus) {
    activityEntries.push({
      action: 'STATUS_CHANGE',
      description: `Status changed to ${data.leadStatus}`,
    })
  }

  const property = await prisma.property.update({
    where: { id },
    data: {
      ...updates,
      ...(activityEntries.length > 0 && {
        activityLogs: {
          createMany: {
            data: activityEntries.map((e) => ({
              userId: session.user.id,
              action: e.action,
              description: e.description,
            })),
          },
        },
        ...(data.activeLeadStage && data.activeLeadStage !== existing.activeLeadStage && {
          stageHistory: {
            create: {
              pipeline: 'leads',
              fromStage: existing.activeLeadStage ?? undefined,
              toStage: data.activeLeadStage,
              changedById: session.user.id,
              changedByName: session.user.name ?? 'Unknown',
            },
          },
        }),
      }),
    },
  })

  return NextResponse.json({ success: true, data: property })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.property.update({
    where: { id },
    data: {
      leadStatus: 'DEAD',
      activityLogs: {
        create: {
          userId: session.user.id,
          action: 'LEAD_DELETED',
          description: 'Lead marked as dead (soft delete)',
        },
      },
    },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Write the implementation — POST /api/leads/[id]/notes**

Create `apps/web/src/app/api/leads/[id]/notes/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CreateNoteSchema = z.object({
  content: z.string().min(1).max(5000),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = CreateNoteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const note = await prisma.note.create({
    data: {
      propertyId: id,
      authorId: session.user.id,
      content: parsed.data.content,
    },
  })

  await prisma.activityLog.create({
    data: {
      propertyId: id,
      userId: session.user.id,
      action: 'NOTE_ADDED',
      description: 'Note added',
    },
  })

  return NextResponse.json({ success: true, data: note }, { status: 201 })
}
```

- [ ] **Step 4: Write the implementation — POST /api/leads/[id]/tasks**

Create `apps/web/src/app/api/leads/[id]/tasks/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(255),
  type: z.enum(['FOLLOW_UP', 'APPOINTMENT', 'OFFER', 'CALL', 'EMAIL', 'OTHER']),
  dueDate: z.string().datetime().optional(),
  assignedToId: z.string().optional(),
  notes: z.string().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = CreateTaskSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const task = await prisma.task.create({
    data: {
      propertyId: id,
      title: parsed.data.title,
      type: parsed.data.type,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      assignedToId: parsed.data.assignedToId ?? session.user.id,
      createdById: session.user.id,
      notes: parsed.data.notes,
      status: 'PENDING',
    },
  })

  return NextResponse.json({ success: true, data: task }, { status: 201 })
}
```

- [ ] **Step 5: Write PATCH /api/tasks/[id] (complete/cancel)**

Create `apps/web/src/app/api/tasks/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const UpdateTaskSchema = z.object({
  status: z.enum(['COMPLETED', 'CANCELLED']),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateTaskSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const task = await prisma.task.update({
    where: { id },
    data: {
      status: parsed.data.status,
      completedAt: parsed.data.status === 'COMPLETED' ? new Date() : undefined,
    },
  })

  return NextResponse.json({ success: true, data: task })
}
```

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/app/api/
git commit -m "feat: add lead mutation Route Handlers (create, update, notes, tasks)"
```

---

### Task 4: AddLeadModal Component

**Files:**
- Create: `apps/web/src/components/leads/AddLeadModal.tsx`
- Modify: `apps/web/src/components/layout/GlobalHeader.tsx`

The `AddLeadModal` is a controlled dialog triggered by the `+ Add` button in `GlobalHeader`. It collects the minimum fields to create a lead and calls `POST /api/leads`.

- [ ] **Step 1: Write AddLeadModal**

Create `apps/web/src/components/leads/AddLeadModal.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface Props {
  open: boolean
  onClose: () => void
  markets: Array<{ id: string; name: string }>
}

export function AddLeadModal({ open, onClose, markets }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    const body = {
      streetAddress: fd.get('streetAddress') as string,
      city: fd.get('city') as string,
      state: fd.get('state') as string,
      zip: fd.get('zip') as string,
      leadType: fd.get('leadType') as string,
      marketId: fd.get('marketId') as string,
      source: fd.get('source') as string,
      contactFirstName: fd.get('contactFirstName') as string,
      contactLastName: fd.get('contactLastName') as string,
      contactPhone: fd.get('contactPhone') as string,
    }

    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const json = await res.json()
    if (!res.ok) {
      setError(json.error?.message ?? 'Failed to create lead')
      return
    }

    const pipeline = body.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
    startTransition(() => {
      router.push(`/leads/${pipeline}/${json.data.id}`)
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="streetAddress">Street Address *</Label>
              <Input id="streetAddress" name="streetAddress" required placeholder="123 Main St" />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" placeholder="Dallas" />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input id="state" name="state" defaultValue="TX" maxLength={2} />
            </div>
            <div>
              <Label htmlFor="zip">Zip</Label>
              <Input id="zip" name="zip" placeholder="75201" />
            </div>
            <div>
              <Label>Lead Type *</Label>
              <select name="leadType" required className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm">
                <option value="DIRECT_TO_SELLER">Direct to Seller (DTS)</option>
                <option value="DIRECT_TO_AGENT">Direct to Agent (DTA)</option>
              </select>
            </div>
            <div>
              <Label>Market *</Label>
              <select name="marketId" required className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm">
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="source">Source</Label>
              <Input id="source" name="source" placeholder="Cold Call, PPC, Direct Mail..." />
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Primary Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="contactFirstName">First Name</Label>
                <Input id="contactFirstName" name="contactFirstName" />
              </div>
              <div>
                <Label htmlFor="contactLastName">Last Name</Label>
                <Input id="contactLastName" name="contactLastName" />
              </div>
              <div className="col-span-2">
                <Label htmlFor="contactPhone">Phone</Label>
                <Input id="contactPhone" name="contactPhone" type="tel" placeholder="(555) 000-0000" />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating...' : 'Create Lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Wire "+ Add" button in GlobalHeader**

Read `apps/web/src/components/layout/GlobalHeader.tsx` first, then modify the `+ Add` button to be a Client Component wrapper that opens AddLeadModal.

The GlobalHeader is a Server Component. Extract just the `+ Add` button into a new Client Component `AddLeadButton`:

Create `apps/web/src/components/leads/AddLeadButton.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddLeadModal } from './AddLeadModal'

interface Props {
  markets: Array<{ id: string; name: string }>
}

export function AddLeadButton({ markets }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="w-4 h-4" />
        Add
      </Button>
      <AddLeadModal open={open} onClose={() => setOpen(false)} markets={markets} />
    </>
  )
}
```

In `GlobalHeader.tsx`, fetch markets and replace the static `+ Add` button with `<AddLeadButton markets={markets} />`:

```typescript
// Add near top of GlobalHeader (Server Component):
import { prisma } from '@/lib/prisma'
import { AddLeadButton } from '@/components/leads/AddLeadButton'

// Inside the component function (Server Component can await):
const markets = await prisma.market.findMany({
  where: { isActive: true },
  select: { id: true, name: true },
  orderBy: { name: 'asc' },
})

// Replace <button className="...">+ Add</button> with:
// <AddLeadButton markets={markets} />
```

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/components/leads/AddLeadModal.tsx apps/web/src/components/leads/AddLeadButton.tsx apps/web/src/components/layout/GlobalHeader.tsx
git commit -m "feat: add AddLeadModal wired to GlobalHeader + Add button"
```

---

### Task 5: Lead List Pages

**Files:**
- Create: `apps/web/src/components/leads/LeadTable.tsx`
- Create: `apps/web/src/components/leads/LeadFilters.tsx`
- Modify: `apps/web/src/app/(app)/leads/dts/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/dta/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/warm/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/dead/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/referred/page.tsx`

The Server Component page reads `searchParams`, calls `getLeadList`, and renders `<LeadFilters>` + `<LeadTable>`. `LeadFilters` is a Client Component that pushes URL param updates without full navigation (`router.replace`).

- [ ] **Step 1: Write LeadTable client component**

Create `apps/web/src/components/leads/LeadTable.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'

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
}

export function LeadTable({ rows, total, pipeline }: Props) {
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
    </div>
  )
}
```

- [ ] **Step 2: Write LeadFilters client component**

Create `apps/web/src/components/leads/LeadFilters.tsx`:

```typescript
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

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
}

export function LeadFilters({ users, showStageFilter = true }: Props) {
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
      params.delete('page') // reset to page 1 on filter change
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`)
      })
    },
    [pathname, router, searchParams]
  )

  return (
    <div className="flex items-center gap-2 mb-3">
      <Input
        placeholder="Search address or contact..."
        defaultValue={searchParams.get('search') ?? ''}
        onChange={(e) => {
          clearTimeout((window as any)._searchDebounce)
          ;(window as any)._searchDebounce = setTimeout(() => updateParam('search', e.target.value), 300)
        }}
        className="max-w-xs h-8 text-sm"
      />

      {showStageFilter && (
        <Select
          defaultValue={searchParams.get('stage') ?? ''}
          onValueChange={(v) => updateParam('stage', v)}
        >
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            {STAGE_OPTIONS.map((o) => (
              <SelectItem key={o.value || '__all'} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        defaultValue={searchParams.get('assignedToId') ?? ''}
        onValueChange={(v) => updateParam('assignedToId', v)}
      >
        <SelectTrigger className="w-40 h-8 text-sm">
          <SelectValue placeholder="All Users" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Users</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
```

- [ ] **Step 3: Install date-fns if not present**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web add date-fns 2>&1 | tail -5
```

- [ ] **Step 4: Write the five lead list pages**

Replace `apps/web/src/app/(app)/leads/dts/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getLeadList } from '@/lib/leads'
import { prisma } from '@/lib/prisma'
import { LeadTable } from '@/components/leads/LeadTable'
import { LeadFilters } from '@/components/leads/LeadFilters'

interface PageProps {
  searchParams: Promise<{ search?: string; stage?: string; assignedToId?: string; page?: string }>
}

export default async function LeadsDtsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const [{ rows, total }, users] = await Promise.all([
    getLeadList({
      pipeline: 'dts',
      search: sp.search,
      stage: sp.stage,
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
      <h1 className="text-xl font-bold text-gray-900">Active Leads — DTS</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Direct to Seller pipeline</p>
      <LeadFilters users={users} />
      <LeadTable rows={rows as any} total={total} pipeline="dts" />
    </div>
  )
}
```

Replace `apps/web/src/app/(app)/leads/dta/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getLeadList } from '@/lib/leads'
import { prisma } from '@/lib/prisma'
import { LeadTable } from '@/components/leads/LeadTable'
import { LeadFilters } from '@/components/leads/LeadFilters'

interface PageProps {
  searchParams: Promise<{ search?: string; stage?: string; assignedToId?: string; page?: string }>
}

export default async function LeadsDtaPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const [{ rows, total }, users] = await Promise.all([
    getLeadList({
      pipeline: 'dta',
      search: sp.search,
      stage: sp.stage,
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
      <h1 className="text-xl font-bold text-gray-900">Active Leads — DTA</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Direct to Agent pipeline</p>
      <LeadFilters users={users} />
      <LeadTable rows={rows as any} total={total} pipeline="dta" />
    </div>
  )
}
```

Replace `apps/web/src/app/(app)/leads/warm/page.tsx`:

```typescript
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
  const [{ rows, total }, users] = await Promise.all([
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
      <LeadFilters users={users} showStageFilter={false} />
      <LeadTable rows={rows as any} total={total} pipeline="warm" />
    </div>
  )
}
```

Replace `apps/web/src/app/(app)/leads/dead/page.tsx`:

```typescript
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
  const [{ rows, total }, users] = await Promise.all([
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
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Closed / not viable</p>
      <LeadFilters users={users} showStageFilter={false} />
      <LeadTable rows={rows as any} total={total} pipeline="dead" />
    </div>
  )
}
```

Replace `apps/web/src/app/(app)/leads/referred/page.tsx`:

```typescript
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
  const [{ rows, total }, users] = await Promise.all([
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
      <h1 className="text-xl font-bold text-gray-900">Referred Leads</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Referred to agent</p>
      <LeadFilters users={users} showStageFilter={false} />
      <LeadTable rows={rows as any} total={total} pipeline="referred" />
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/components/leads/LeadTable.tsx apps/web/src/components/leads/LeadFilters.tsx apps/web/src/app/\(app\)/leads/
git commit -m "feat: implement all five lead list pages with filter and table"
```

---

### Task 6: Lead Detail Page

**Files:**
- Create: `apps/web/src/components/leads/LeadDetailHeader.tsx`
- Create: `apps/web/src/components/leads/ContactsCard.tsx`
- Create: `apps/web/src/components/leads/NotesCard.tsx`
- Create: `apps/web/src/components/leads/TasksCard.tsx`
- Create: `apps/web/src/app/(app)/leads/dts/[id]/page.tsx`
- Create: `apps/web/src/app/(app)/leads/dta/[id]/page.tsx`

The detail page is the most complex page in Phase 2. It uses a two-column layout: left column is property details + contact + notes + activity; right column is stage management + tasks + quick actions.

- [ ] **Step 1: Write LeadDetailHeader**

Create `apps/web/src/components/leads/LeadDetailHeader.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Flame, Star } from 'lucide-react'

const ACTIVE_STAGES = [
  { value: 'NEW_LEAD', label: 'New Lead' },
  { value: 'DISCOVERY', label: 'Discovery' },
  { value: 'INTERESTED_ADD_TO_FOLLOW_UP', label: 'Follow Up' },
  { value: 'APPOINTMENT_MADE', label: 'Appointment' },
  { value: 'DUE_DILIGENCE', label: 'Due Diligence' },
  { value: 'OFFER_MADE', label: 'Offer Made' },
  { value: 'OFFER_FOLLOW_UP', label: 'Offer Follow Up' },
  { value: 'UNDER_CONTRACT', label: 'Under Contract' },
]

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'WARM', label: 'Warm' },
  { value: 'DEAD', label: 'Dead' },
  { value: 'REFERRED_TO_AGENT', label: 'Referred' },
]

interface Props {
  id: string
  pipeline: 'dts' | 'dta'
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  activeLeadStage: string | null
  leadStatus: string
  isHot: boolean
  isFavorited: boolean
  source: string | null
  createdAt: Date
}

export function LeadDetailHeader({
  id, pipeline, streetAddress, city, state, zip,
  activeLeadStage, leadStatus, isHot, isFavorited, source, createdAt,
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
            <button onClick={() => patch({ isHot: !isHot })} className="text-lg" title="Toggle hot">
              {isHot ? '🔥' : <Flame className="w-4 h-4 text-gray-300" />}
            </button>
            <button onClick={() => patch({ isFavorited: !isFavorited })} className="text-lg" title="Toggle favorite">
              <Star className={`w-4 h-4 ${isFavorited ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
            </button>
          </div>
          <p className="text-sm text-gray-500">
            {[city, state, zip].filter(Boolean).join(', ')}
            {source && <span className="ml-2 text-gray-400">· {source}</span>}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Added {new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {pipeline === 'dts' && (
            <Select value={activeLeadStage ?? ''} onValueChange={(v) => patch({ activeLeadStage: v })}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="Set stage" />
              </SelectTrigger>
              <SelectContent>
                {ACTIVE_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={leadStatus} onValueChange={(v) => patch({ leadStatus: v })}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write NotesCard**

Create `apps/web/src/components/leads/NotesCard.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatDistanceToNow } from 'date-fns'

interface Note {
  id: string
  content: string
  createdAt: Date
  authorId: string
}

interface Props {
  propertyId: string
  notes: Note[]
}

export function NotesCard({ propertyId, notes }: Props) {
  const router = useRouter()
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function addNote() {
    if (!content.trim()) return
    setError(null)

    const res = await fetch(`/api/leads/${propertyId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })

    if (!res.ok) {
      setError('Failed to save note')
      return
    }

    setContent('')
    startTransition(() => router.refresh())
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">Notes</h3>

      <div className="mb-3">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a note..."
          rows={3}
          className="text-sm resize-none"
        />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        <Button
          size="sm"
          className="mt-2"
          disabled={isPending || !content.trim()}
          onClick={addNote}
        >
          {isPending ? 'Saving...' : 'Add Note'}
        </Button>
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto">
        {notes.length === 0 ? (
          <p className="text-sm text-gray-400">No notes yet</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="border-b border-gray-50 pb-3 last:border-0">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</p>
              <p className="text-[11px] text-gray-400 mt-1">
                {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write TasksCard**

Create `apps/web/src/components/leads/TasksCard.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle, Circle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Task {
  id: string
  title: string
  type: string
  status: string
  dueDate: Date | null
  assignedTo: { name: string } | null
}

interface Props {
  propertyId: string
  tasks: Task[]
}

export function TasksCard({ propertyId, tasks }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)

  const pendingTasks = tasks.filter((t) => t.status === 'PENDING')
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED')

  async function completeTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    })
    startTransition(() => router.refresh())
  }

  async function handleAddTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    await fetch(`/api/leads/${propertyId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: fd.get('title'),
        type: fd.get('type'),
        dueDate: fd.get('dueDate') ? new Date(fd.get('dueDate') as string).toISOString() : undefined,
      }),
    })
    setShowForm(false)
    startTransition(() => router.refresh())
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">
          Tasks {pendingTasks.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px]">
              {pendingTasks.length}
            </span>
          )}
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          + Add Task
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleAddTask} className="mb-3 border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
          <div>
            <Label htmlFor="taskTitle" className="text-xs">Task</Label>
            <Input id="taskTitle" name="title" required placeholder="Follow up call" className="h-8 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Type</Label>
              <select name="type" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm">
                <option value="FOLLOW_UP">Follow Up</option>
                <option value="CALL">Call</option>
                <option value="APPOINTMENT">Appointment</option>
                <option value="OFFER">Offer</option>
                <option value="EMAIL">Email</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <Label htmlFor="taskDue" className="text-xs">Due Date</Label>
              <Input id="taskDue" name="dueDate" type="datetime-local" className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>Save</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {pendingTasks.length === 0 && !showForm && (
          <p className="text-sm text-gray-400">No open tasks</p>
        )}
        {pendingTasks.map((task) => (
          <div key={task.id} className="flex items-start gap-2">
            <button onClick={() => completeTask(task.id)} className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-emerald-500 transition-colors">
              <Circle className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 leading-tight">{task.title}</p>
              <p className="text-[11px] text-gray-400">
                {task.type}
                {task.dueDate && ` · due ${formatDistanceToNow(new Date(task.dueDate), { addSuffix: true })}`}
                {task.assignedTo && ` · ${task.assignedTo.name}`}
              </p>
            </div>
          </div>
        ))}

        {completedTasks.length > 0 && (
          <details className="mt-2">
            <summary className="text-[11px] text-gray-400 cursor-pointer">
              {completedTasks.length} completed task{completedTasks.length !== 1 ? 's' : ''}
            </summary>
            <div className="mt-2 space-y-1.5">
              {completedTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 opacity-50">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <p className="text-sm text-gray-600 line-through">{task.title}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write ContactsCard**

Create `apps/web/src/components/leads/ContactsCard.tsx`:

```typescript
'use client'

import { Phone, Mail } from 'lucide-react'

interface Contact {
  id: string
  isPrimary: boolean
  role: string | null
  contact: {
    id: string
    firstName: string
    lastName: string | null
    phone: string | null
    phone2: string | null
    email: string | null
    type: string
  }
}

interface Props {
  contacts: Contact[]
}

export function ContactsCard({ contacts }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">
        Contacts <span className="text-gray-400 font-normal">({contacts.length})</span>
      </h3>

      {contacts.length === 0 ? (
        <p className="text-sm text-gray-400">No contacts</p>
      ) : (
        <div className="space-y-3">
          {contacts.map((pc) => (
            <div key={pc.id} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-blue-700">
                  {pc.contact.firstName[0]}{pc.contact.lastName?.[0] ?? ''}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-900">
                    {pc.contact.firstName} {pc.contact.lastName}
                  </p>
                  {pc.isPrimary && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">Primary</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">{pc.role ?? pc.contact.type}</p>
                <div className="flex items-center gap-3 mt-1">
                  {pc.contact.phone && (
                    <a href={`tel:${pc.contact.phone}`} className="flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600">
                      <Phone className="w-3 h-3" />
                      {pc.contact.phone}
                    </a>
                  )}
                  {pc.contact.email && (
                    <a href={`mailto:${pc.contact.email}`} className="flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600">
                      <Mail className="w-3 h-3" />
                      {pc.contact.email}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Write the lead detail pages**

Create `apps/web/src/app/(app)/leads/dts/[id]/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getLeadById } from '@/lib/leads'
import { LeadDetailHeader } from '@/components/leads/LeadDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { NotesCard } from '@/components/leads/NotesCard'
import { TasksCard } from '@/components/leads/TasksCard'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type Params = { params: Promise<{ id: string }> }

export default async function LeadDtsDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const lead = await getLeadById(id)
  if (!lead) notFound()

  return (
    <div>
      <Link href="/leads/dts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
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

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <ContactsCard contacts={lead.contacts as any} />
          <NotesCard propertyId={lead.id} notes={lead.notes as any} />
        </div>
        <div className="space-y-4">
          <TasksCard propertyId={lead.id} tasks={lead.tasks as any} />

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Property Details</h3>
            <dl className="space-y-1.5 text-sm">
              {[
                ['Bedrooms', lead.bedrooms],
                ['Bathrooms', lead.bathrooms?.toString()],
                ['Sq Ft', lead.sqft?.toLocaleString()],
                ['Year Built', lead.yearBuilt],
                ['Lot Size', lead.lotSize ? `${lead.lotSize} acres` : null],
                ['Property Type', lead.propertyType],
                ['Asking Price', lead.askingPrice ? `$${Number(lead.askingPrice).toLocaleString()}` : null],
                ['ARV', lead.arv ? `$${Number(lead.arv).toLocaleString()}` : null],
                ['Repair Est.', lead.repairEstimate ? `$${Number(lead.repairEstimate).toLocaleString()}` : null],
              ].filter(([, v]) => v != null).map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="text-gray-900 font-medium">{value}</dd>
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

Create `apps/web/src/app/(app)/leads/dta/[id]/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getLeadById } from '@/lib/leads'
import { LeadDetailHeader } from '@/components/leads/LeadDetailHeader'
import { ContactsCard } from '@/components/leads/ContactsCard'
import { NotesCard } from '@/components/leads/NotesCard'
import { TasksCard } from '@/components/leads/TasksCard'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type Params = { params: Promise<{ id: string }> }

export default async function LeadDtaDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const lead = await getLeadById(id)
  if (!lead) notFound()

  return (
    <div>
      <Link href="/leads/dta" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
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

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <ContactsCard contacts={lead.contacts as any} />
          <NotesCard propertyId={lead.id} notes={lead.notes as any} />
        </div>
        <div className="space-y-4">
          <TasksCard propertyId={lead.id} tasks={lead.tasks as any} />
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Property Details</h3>
            <dl className="space-y-1.5 text-sm">
              {[
                ['Bedrooms', lead.bedrooms],
                ['Bathrooms', lead.bathrooms?.toString()],
                ['Sq Ft', lead.sqft?.toLocaleString()],
                ['Year Built', lead.yearBuilt],
                ['Asking Price', lead.askingPrice ? `$${Number(lead.askingPrice).toLocaleString()}` : null],
                ['ARV', lead.arv ? `$${Number(lead.arv).toLocaleString()}` : null],
              ].filter(([, v]) => v != null).map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="text-gray-900 font-medium">{value}</dd>
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

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/components/leads/ apps/web/src/app/\(app\)/leads/dts/\[id\]/ apps/web/src/app/\(app\)/leads/dta/\[id\]/
git commit -m "feat: implement lead detail page with contacts, notes, tasks"
```

---

### Task 7: Global Tasks Page

**Files:**
- Create: `apps/web/src/components/tasks/TaskTable.tsx`
- Modify: `apps/web/src/app/(app)/tasks/page.tsx`

- [ ] **Step 1: Write TaskTable**

Create `apps/web/src/components/tasks/TaskTable.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Circle, CheckCircle } from 'lucide-react'

interface TaskRow {
  id: string
  title: string
  type: string
  status: string
  dueDate: Date | null
  assignedTo: { name: string } | null
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    state: string | null
    leadType: string
  } | null
}

interface Props {
  rows: TaskRow[]
  total: number
}

export function TaskTable({ rows, total }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  async function completeTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    })
    startTransition(() => router.refresh())
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No open tasks</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
        {total} open task{total !== 1 ? 's' : ''}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
            <th className="w-8 px-4 py-2.5"></th>
            <th className="text-left px-4 py-2.5">Task</th>
            <th className="text-left px-4 py-2.5">Property</th>
            <th className="text-left px-4 py-2.5">Assigned</th>
            <th className="text-left px-4 py-2.5">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((task) => {
            const pipeline = task.property?.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
            const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()
            return (
              <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <button
                    onClick={() => completeTask(task.id)}
                    className="text-gray-300 hover:text-emerald-500 transition-colors"
                  >
                    <Circle className="w-4 h-4" />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{task.title}</p>
                  <p className="text-[11px] text-gray-400">{task.type.replace(/_/g, ' ')}</p>
                </td>
                <td className="px-4 py-3">
                  {task.property ? (
                    <button
                      onClick={() => router.push(`/leads/${pipeline}/${task.property!.id}`)}
                      className="text-left hover:text-blue-600 transition-colors"
                    >
                      <p className="text-gray-800">{task.property.streetAddress ?? 'Unknown'}</p>
                      <p className="text-[11px] text-gray-400">
                        {[task.property.city, task.property.state].filter(Boolean).join(', ')}
                      </p>
                    </button>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{task.assignedTo?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  {task.dueDate ? (
                    <span className={`text-[11px] ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {formatDistanceToNow(new Date(task.dueDate), { addSuffix: true })}
                    </span>
                  ) : <span className="text-gray-300">—</span>}
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

- [ ] **Step 2: Write tasks page**

Replace `apps/web/src/app/(app)/tasks/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getTaskList } from '@/lib/tasks'
import { TaskTable } from '@/components/tasks/TaskTable'

interface PageProps {
  searchParams: Promise<{ overdue?: string; dueToday?: string; assignedToId?: string; page?: string }>
}

export default async function TasksPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams

  const { rows, total } = await getTaskList({
    assignedToId: sp.assignedToId,
    overdue: sp.overdue === '1',
    dueToday: sp.dueToday === '1',
    page: sp.page ? parseInt(sp.page) : 1,
  })

  const overdueCount = await (async () => {
    const { total: t } = await getTaskList({ overdue: true })
    return t
  })()

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Tasks</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">
        {overdueCount > 0 && (
          <span className="text-red-600 font-medium">{overdueCount} overdue · </span>
        )}
        All open tasks
      </p>
      <TaskTable rows={rows as any} total={total} />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/components/tasks/ apps/web/src/app/\(app\)/tasks/page.tsx
git commit -m "feat: implement global tasks page"
```

---

### Task 8: Dashboard with Real Data & Activity Page

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(app)/activity/page.tsx`

- [ ] **Step 1: Update dashboard with real Prisma counts**

Replace `apps/web/src/app/(app)/dashboard/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getTaskList } from '@/lib/tasks'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    newLeadsToday,
    openLeads,
    hotLeads,
    underContract,
    { rows: dueTodayTasks },
    leadVolume,
  ] = await Promise.all([
    prisma.property.count({
      where: { leadStatus: 'ACTIVE', createdAt: { gte: today } },
    }),
    prisma.property.count({
      where: { leadStatus: 'ACTIVE' },
    }),
    prisma.property.count({
      where: { leadStatus: 'ACTIVE', isHot: true },
    }),
    prisma.property.count({
      where: { activeLeadStage: 'UNDER_CONTRACT' },
    }),
    getTaskList({ dueToday: true, pageSize: 10 }),
    // Last 7 days lead volume
    Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today)
        d.setDate(d.getDate() - (6 - i))
        const next = new Date(d)
        next.setDate(next.getDate() + 1)
        return prisma.property.count({
          where: { createdAt: { gte: d, lt: next } },
        })
      })
    ),
  ])

  const maxVol = Math.max(...leadVolume, 1)
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today']

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-5">
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · DFW Market
      </p>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'New Leads Today', value: newLeadsToday, color: 'text-blue-600' },
          { label: 'Open Leads', value: openLeads, color: 'text-red-500' },
          { label: 'Hot Leads', value: `🔥 ${hotLeads}`, color: 'text-amber-500' },
          { label: 'Under Contract', value: underContract, color: 'text-emerald-600' },
        ].map((w) => (
          <div key={w.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              {w.label}
            </p>
            <p className={`text-3xl font-extrabold ${w.color}`}>{w.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[13px] font-semibold text-gray-900 mb-3">Lead Volume — Last 7 Days</p>
          <div className="flex items-end gap-2 h-20">
            {leadVolume.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-gray-400">{count > 0 ? count : ''}</span>
                <div
                  className={`w-full rounded-t ${i === 6 ? 'bg-blue-600' : 'bg-blue-100'}`}
                  style={{ height: `${Math.max((count / maxVol) * 100, 4)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
            {days.map((d) => <span key={d}>{d}</span>)}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[13px] font-semibold text-gray-900 mb-3">Tasks Due Today</p>
          {dueTodayTasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">All clear!</p>
          ) : (
            <div className="space-y-2">
              {dueTodayTasks.map((task) => (
                <div key={task.id} className="text-sm">
                  <p className="text-gray-800 font-medium truncate">{task.title}</p>
                  <p className="text-[11px] text-gray-400">
                    {task.property?.streetAddress ?? 'No property'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write activity page**

Replace `apps/web/src/app/(app)/activity/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getActivityFeed } from '@/lib/activity'
import { formatDistanceToNow } from 'date-fns'

export default async function ActivityPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const logs = await getActivityFeed({ pageSize: 100 })

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Activity</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-5">Recent actions across all leads</p>

      {logs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
          <p className="text-sm text-gray-400">No activity yet</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
          {logs.map((log) => (
            <div key={log.id} className="px-5 py-3 flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-semibold text-gray-600">
                  {log.user?.name?.[0] ?? '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">{log.description}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {log.user?.name ?? 'System'}
                  {log.property && (
                    <> · {log.property.streetAddress ?? 'Unknown property'}</>
                  )}
                  {' · '}
                  {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/app/\(app\)/dashboard/page.tsx apps/web/src/app/\(app\)/activity/page.tsx
git commit -m "feat: wire dashboard with real counts and implement activity page"
```

---

### Task 9: Build Verification & Smoke Test

**Files:** None created — verification only

- [ ] **Step 1: Ensure Docker services are running**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
docker compose ps 2>&1
```
Expected: postgres, redis, minio all `Up` or `running`

If not running:
```bash
docker compose up -d
```

- [ ] **Step 2: Run all tests**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run 2>&1 | tail -30
PATH=/c/node-x64:$PATH pnpm --filter @crm/shared exec vitest run 2>&1 | tail -10
PATH=/c/node-x64:$PATH pnpm --filter @crm/api exec vitest run 2>&1 | tail -10
```
Expected: All tests pass (9 + 6 existing + 9 new = 24 total)

- [ ] **Step 3: TypeScript build check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | head -40
```
Expected: No type errors (or only pre-existing ones)

- [ ] **Step 4: Start web app and verify pages load**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web"
PATH=/c/node-x64:$PATH /c/node-x64/node.exe node_modules/.bin/next dev --port 3000 2>&1 &
sleep 5
```

Manual verify checklist:
- `localhost:3000` → redirects to `/login`
- Login with `admin@homewardpartners.com` / `Admin1234!` → redirects to `/dashboard`
- `/dashboard` → shows real counts (all zeros is OK, no "Coming in Phase 2")
- `/leads/dts` → shows empty table with filter bar
- Click `+ Add` → AddLeadModal opens
- Add a test lead → redirected to detail page
- Detail page shows header, contacts card, notes, tasks
- Add a note → appears immediately after refresh
- Add a task → appears in Tasks card
- Complete a task → moves to completed section
- `/tasks` → shows task table (task just created should appear)
- `/activity` → shows activity entries

- [ ] **Step 5: Final commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add -A
git commit -m "feat: Phase 2 complete — leads pipeline, detail page, tasks, dashboard, activity"
```

---

## Summary

**What Phase 2 delivers:**
- All 5 lead list views with real data, search, stage/user filters, pagination
- Lead detail page (DTS + DTA) with contacts, notes, tasks, stage/status management
- Add Lead modal wired to the global `+ Add` button  
- Global Tasks page with overdue highlighting and one-click completion
- Dashboard with live counts and 7-day lead volume chart
- Activity feed showing all CRM events

**What Phase 2 does NOT include** (deferred to later phases):
- Communications (SMS/Email/Call from detail page) → Phase 3
- Calendar page → Phase 3
- Campaigns / Automations → Phase 4
- TM / Inventory / Dispo pipelines → Phase 3
- Analytics → Phase 5
- Buyer/Vendor management → Phase 4
