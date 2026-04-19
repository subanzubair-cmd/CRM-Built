# Gap 3+4: Financial Goals + Dashboard Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Let users set annual Revenue/Marketing/Net Income goals and show progress bars vs actuals on the analytics dashboard. (B) Add 5 new dashboard widgets: conversion trend chart, lead source breakdown, call stats, unclaimed count, unassigned count.

**Architecture:** `FinancialGoal` model already exists in the schema (`{ year, type: string, target, userId }`). The analytics page is at `/analytics` and uses server-side Prisma queries. New widgets are added as server components. No schema changes needed. Charts use vanilla SVG (no chart library dependency) or simple CSS bars since the project uses plain Tailwind.

**Tech Stack:** Next.js 15 App Router, Prisma (PostgreSQL), plain Tailwind CSS. No chart libraries.

---

## Task 1: Financial Goals API (CRUD)

**Files:**
- Create: `apps/web/src/app/api/goals/route.ts`
- Create: `apps/web/src/app/api/goals/[id]/route.ts`

- [ ] **Step 1: Create GET + POST route**

```typescript
// apps/web/src/app/api/goals/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const GoalSchema = z.object({
  year: z.number().int().min(2020).max(2040),
  type: z.enum(['REVENUE', 'MARKETING_SPEND', 'NET_INCOME']),
  target: z.number().positive(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const year = req.nextUrl.searchParams.get('year')
    ? parseInt(req.nextUrl.searchParams.get('year')!)
    : new Date().getFullYear()

  const goals = await prisma.financialGoal.findMany({
    where: { userId: session.user.id, year },
    orderBy: { type: 'asc' },
  })

  return NextResponse.json({ data: goals })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const json = await req.json()
  const parsed = GoalSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const goal = await prisma.financialGoal.upsert({
    where: { userId_year_type: { userId: session.user.id, year: parsed.data.year, type: parsed.data.type } },
    update: { target: parsed.data.target },
    create: { userId: session.user.id, ...parsed.data },
  })

  return NextResponse.json({ data: goal }, { status: 201 })
}
```

- [ ] **Step 2: Create PATCH + DELETE route**

```typescript
// apps/web/src/app/api/goals/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { target } = await req.json()
  if (!target || isNaN(Number(target))) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  const goal = await prisma.financialGoal.update({
    where: { id: params.id, userId: session.user.id },
    data: { target },
  })

  return NextResponse.json({ data: goal })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.financialGoal.delete({
    where: { id: params.id, userId: session.user.id },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/goals/
git commit -m "feat(gap3): add GET/POST/PATCH/DELETE /api/goals routes"
```

---

## Task 2: Financial Goals widget on Analytics page

**Files:**
- Create: `apps/web/src/components/analytics/FinancialGoalsWidget.tsx`

- [ ] **Step 1: Create the widget**

```typescript
// apps/web/src/components/analytics/FinancialGoalsWidget.tsx
'use client'

import { useState, useEffect } from 'react'
import { Target, TrendingUp } from 'lucide-react'

interface Goal {
  id: string
  type: string
  target: number
  year: number
}

const GOAL_LABELS: Record<string, string> = {
  REVENUE: 'Revenue',
  MARKETING_SPEND: 'Marketing Spend',
  NET_INCOME: 'Net Income',
}

const GOAL_COLORS: Record<string, string> = {
  REVENUE: 'bg-green-500',
  MARKETING_SPEND: 'bg-blue-500',
  NET_INCOME: 'bg-purple-500',
}

interface Props {
  yearToDateRevenue: number
  yearToDateMarketing: number
  yearToDateNetIncome: number
}

export function FinancialGoalsWidget({ yearToDateRevenue, yearToDateMarketing, yearToDateNetIncome }: Props) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [editingType, setEditingType] = useState<string | null>(null)
  const [inputVal, setInputVal] = useState('')
  const [saving, setSaving] = useState(false)
  const year = new Date().getFullYear()

  const actuals: Record<string, number> = {
    REVENUE: yearToDateRevenue,
    MARKETING_SPEND: yearToDateMarketing,
    NET_INCOME: yearToDateNetIncome,
  }

  useEffect(() => {
    fetch(`/api/goals?year=${year}`)
      .then((r) => r.json())
      .then((j) => setGoals(j.data ?? []))
  }, [year])

  async function saveGoal(type: string) {
    const target = parseFloat(inputVal.replace(/[^0-9.]/g, ''))
    if (isNaN(target) || target <= 0) return
    setSaving(true)
    await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, type, target }),
    })
    const updated = await fetch(`/api/goals?year=${year}`).then((r) => r.json())
    setGoals(updated.data ?? [])
    setEditingType(null)
    setInputVal('')
    setSaving(false)
  }

  const types = ['REVENUE', 'MARKETING_SPEND', 'NET_INCOME']

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-gray-400" />
        <h3 className="font-semibold text-gray-900 text-sm">Financial Goals — {year}</h3>
      </div>
      <div className="space-y-4">
        {types.map((type) => {
          const goal = goals.find((g) => g.type === type)
          const actual = actuals[type] ?? 0
          const target = goal ? Number(goal.target) : null
          const pct = target ? Math.min(100, Math.round((actual / target) * 100)) : 0

          return (
            <div key={type}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-600">{GOAL_LABELS[type]}</span>
                {editingType === type ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveGoal(type); if (e.key === 'Escape') { setEditingType(null); setInputVal('') } }}
                      placeholder="e.g. 500000"
                      className="w-24 border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button onClick={() => saveGoal(type)} disabled={saving} className="text-xs text-blue-600 hover:text-blue-800">Save</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingType(type); setInputVal(target ? String(target) : '') }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {target ? `$${target.toLocaleString()} goal` : 'Set goal'}
                  </button>
                )}
              </div>
              {target ? (
                <>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${GOAL_COLORS[type]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-gray-400">${actual.toLocaleString()} YTD</span>
                    <span className="text-[10px] text-gray-400">{pct}%</span>
                  </div>
                </>
              ) : (
                <div className="h-2 bg-gray-100 rounded-full" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/analytics/FinancialGoalsWidget.tsx
git commit -m "feat(gap3): add FinancialGoalsWidget with progress bars"
```

---

## Task 3: New analytics queries

**Files:**
- Modify: `apps/web/src/lib/analytics.ts` (or wherever analytics queries live)

- [ ] **Step 1: Read the analytics lib**

Read `apps/web/src/lib/analytics.ts`. It has existing KPI queries. Add these new functions:

```typescript
/** Conversion trend: count of properties created per week for last 8 weeks, grouped by current pipeline stage */
export async function getConversionTrend() {
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 3600 * 1000)
  const properties = await prisma.property.findMany({
    where: { createdAt: { gte: eightWeeksAgo } },
    select: { createdAt: true, propertyStatus: true },
  })

  const weeks: Record<string, { leads: number; contracted: number; sold: number }> = {}
  for (const p of properties) {
    const week = p.createdAt.toISOString().slice(0, 10) // approximation — use week start
    const d = new Date(p.createdAt)
    const weekStart = new Date(d.setDate(d.getDate() - d.getDay()))
    const key = weekStart.toISOString().slice(0, 10)
    if (!weeks[key]) weeks[key] = { leads: 0, contracted: 0, sold: 0 }
    weeks[key].leads++
    if (['UNDER_CONTRACT', 'IN_TM', 'IN_DISPO', 'IN_INVENTORY', 'SOLD', 'RENTAL'].includes(p.propertyStatus)) {
      weeks[key].contracted++
    }
    if (['SOLD', 'RENTAL'].includes(p.propertyStatus)) weeks[key].sold++
  }

  return Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, counts]) => ({ week, ...counts }))
}

/** Lead source breakdown */
export async function getLeadSourceBreakdown() {
  const results = await prisma.property.groupBy({
    by: ['source'],
    _count: { _all: true },
    orderBy: { _count: { source: 'desc' } },
    take: 10,
  })
  return results.map((r) => ({ source: r.source ?? 'Unknown', count: r._count._all }))
}

/** Call statistics */
export async function getCallStats() {
  const calls = await prisma.message.aggregate({
    where: { channel: 'CALL' },
    _count: { _all: true },
  })
  const outbound = await prisma.message.count({ where: { channel: 'CALL', direction: 'OUTBOUND' } })
  const inbound = await prisma.message.count({ where: { channel: 'CALL', direction: 'INBOUND' } })
  return { total: calls._count._all, outbound, inbound }
}

/** Unclaimed and unassigned property counts */
export async function getUnclaimedCounts() {
  const unassigned = await prisma.property.count({
    where: { assignedToId: null, propertyStatus: { notIn: ['SOLD', 'RENTAL', 'DEAD'] } },
  })
  return { unassigned }
}

/** Year-to-date financials from sold properties */
export async function getYtdFinancials() {
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const soldProperties = await prisma.property.findMany({
    where: { propertyStatus: 'SOLD', soldAt: { gte: yearStart } },
    select: { offerPrice: true, askingPrice: true, repairEstimate: true },
  })
  let revenue = 0, marketing = 0
  for (const p of soldProperties) {
    if (p.offerPrice) revenue += Number(p.offerPrice)
    if (p.repairEstimate) marketing += Number(p.repairEstimate)
  }
  // Net income = revenue - marketing spend (simplified)
  return { revenue, marketing, netIncome: revenue - marketing }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/analytics.ts
git commit -m "feat(gap4): add conversion trend, lead source, call stats, unassigned queries"
```

---

## Task 4: New dashboard widgets + wire FinancialGoalsWidget

**Files:**
- Create: `apps/web/src/components/analytics/LeadSourceChart.tsx`
- Create: `apps/web/src/components/analytics/ConversionTrendChart.tsx`
- Modify: `apps/web/src/app/(app)/analytics/page.tsx`

- [ ] **Step 1: Create LeadSourceChart**

```typescript
// apps/web/src/components/analytics/LeadSourceChart.tsx
interface Props {
  data: { source: string; count: number }[]
}

export function LeadSourceChart({ data }: Props) {
  if (data.length === 0) return null
  const max = Math.max(...data.map((d) => d.count))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900 text-sm mb-4">Lead Sources</h3>
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.source} className="flex items-center gap-3">
            <span className="w-28 text-xs text-gray-600 truncate">{d.source}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${Math.round((d.count / max) * 100)}%` }}
              />
            </div>
            <span className="w-6 text-xs text-gray-500 text-right">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create ConversionTrendChart (ASCII-style bar chart)**

```typescript
// apps/web/src/components/analytics/ConversionTrendChart.tsx
interface WeekData {
  week: string
  leads: number
  contracted: number
  sold: number
}

interface Props {
  data: WeekData[]
}

export function ConversionTrendChart({ data }: Props) {
  if (data.length === 0) return null
  const max = Math.max(...data.map((d) => d.leads), 1)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900 text-sm mb-4">Conversion Trend (8 weeks)</h3>
      <div className="flex items-end gap-1 h-20">
        {data.map((d) => (
          <div key={d.week} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex flex-col gap-0.5">
              <div
                className="w-full bg-blue-100 rounded-sm"
                style={{ height: `${Math.round((d.leads / max) * 56)}px` }}
                title={`${d.leads} leads`}
              />
              <div
                className="w-full bg-blue-400 rounded-sm"
                style={{ height: `${Math.round((d.contracted / max) * 56)}px` }}
                title={`${d.contracted} contracted`}
              />
            </div>
            <span className="text-[9px] text-gray-400 text-center">
              {d.week.slice(5)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-2">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-blue-100" /><span className="text-[10px] text-gray-500">New leads</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-blue-400" /><span className="text-[10px] text-gray-500">Contracted</span></div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire everything into analytics page**

Read `apps/web/src/app/(app)/analytics/page.tsx`. It fetches KPI data server-side and renders cards. 

Add these imports:
```typescript
import { FinancialGoalsWidget } from '@/components/analytics/FinancialGoalsWidget'
import { LeadSourceChart } from '@/components/analytics/LeadSourceChart'
import { ConversionTrendChart } from '@/components/analytics/ConversionTrendChart'
import { getConversionTrend, getLeadSourceBreakdown, getCallStats, getUnclaimedCounts, getYtdFinancials } from '@/lib/analytics'
```

In the server function, add fetches:
```typescript
const [conversionTrend, leadSources, callStats, unclaimedCounts, ytdFinancials] = await Promise.all([
  getConversionTrend(),
  getLeadSourceBreakdown(),
  getCallStats(),
  getUnclaimedCounts(),
  getYtdFinancials(),
])
```

Add a summary banner above the KPI grid:
```tsx
{/* Summary counts */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
    <p className="text-2xl font-bold text-amber-700">{unclaimedCounts.unassigned}</p>
    <p className="text-xs text-amber-600 mt-0.5">Unassigned</p>
  </div>
  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
    <p className="text-2xl font-bold text-blue-700">{callStats.total}</p>
    <p className="text-xs text-blue-600 mt-0.5">Total Calls</p>
  </div>
  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
    <p className="text-2xl font-bold text-blue-700">{callStats.outbound}</p>
    <p className="text-xs text-blue-600 mt-0.5">Outbound</p>
  </div>
  <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
    <p className="text-2xl font-bold text-green-700">{callStats.inbound}</p>
    <p className="text-xs text-green-600 mt-0.5">Inbound</p>
  </div>
</div>
```

Below the existing KPI grid, add a 2-column section:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
  <ConversionTrendChart data={conversionTrend} />
  <LeadSourceChart data={leadSources} />
  <FinancialGoalsWidget
    yearToDateRevenue={ytdFinancials.revenue}
    yearToDateMarketing={ytdFinancials.marketing}
    yearToDateNetIncome={ytdFinancials.netIncome}
  />
</div>
```

- [ ] **Step 4: Commit all**

```bash
git add \
  apps/web/src/components/analytics/ \
  apps/web/src/app/(app)/analytics/page.tsx
git commit -m "feat(gap3+4): add financial goals widget, lead source chart, conversion trend to analytics"
```
