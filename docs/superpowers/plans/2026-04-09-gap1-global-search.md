# Gap 1: Global Search Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent global search bar to the top navbar that searches across properties (address), contacts (name/phone), notes, tasks, and buyers — returning grouped results in a dropdown with click-through navigation.

**Architecture:** A new server-side search API (`GET /api/search?q=...`) runs parallel ILIKE queries across 5 models. The search bar is a client component in the header/layout that debounces input, fetches from the API, and renders a floating result dropdown. Results are grouped by entity type and clicking navigates to the entity's detail page. No full-text index needed (ILIKE is sufficient for initial implementation).

**Tech Stack:** Next.js 15 App Router, Prisma (PostgreSQL ILIKE), plain Tailwind CSS, lucide-react. Debounce: `use-debounce` or manual setTimeout.

---

## Task 1: GET /api/search route

**Files:**
- Create: `apps/web/src/app/api/search/route.ts`

- [ ] **Step 1: Create the search route**

```typescript
// apps/web/src/app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

interface SearchResult {
  id: string
  type: 'property' | 'contact' | 'note' | 'task' | 'buyer'
  title: string
  subtitle: string
  href: string
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ data: [] })

  const pattern = `%${q}%`

  // Run all queries in parallel
  const [properties, contacts, notes, tasks] = await Promise.all([
    prisma.property.findMany({
      where: {
        OR: [
          { streetAddress: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
          { normalizedAddress: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, streetAddress: true, city: true, state: true, propertyStatus: true, leadStatus: true },
      take: 5,
    }),
    prisma.contact.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, phone: true, properties: { take: 1, select: { propertyId: true } } },
      take: 5,
    }),
    prisma.note.findMany({
      where: { body: { contains: q, mode: 'insensitive' } },
      select: { id: true, body: true, propertyId: true, property: { select: { streetAddress: true, city: true, propertyStatus: true, leadStatus: true } } },
      take: 5,
    }),
    prisma.task.findMany({
      where: { title: { contains: q, mode: 'insensitive' } },
      select: { id: true, title: true, propertyId: true, property: { select: { streetAddress: true, city: true, propertyStatus: true, leadStatus: true } } },
      take: 5,
    }),
  ])

  function propertyHref(p: { id: string; propertyStatus: string; leadStatus?: string }): string {
    if (p.propertyStatus === 'IN_TM') return `/tm/${p.id}`
    if (p.propertyStatus === 'IN_INVENTORY') return `/inventory/${p.id}`
    if (p.propertyStatus === 'IN_DISPO') return `/dispo/${p.id}`
    if (p.propertyStatus === 'SOLD') return `/sold/${p.id}`
    if (p.propertyStatus === 'RENTAL') return `/rental/${p.id}`
    return `/leads/dts/${p.id}`
  }

  const results: SearchResult[] = [
    ...properties.map((p) => ({
      id: p.id,
      type: 'property' as const,
      title: [p.streetAddress, p.city, p.state].filter(Boolean).join(', ') || p.id,
      subtitle: p.propertyStatus?.replace(/_/g, ' ') ?? '',
      href: propertyHref(p),
    })),
    ...contacts.map((c) => ({
      id: c.id,
      type: 'contact' as const,
      title: [c.firstName, c.lastName].filter(Boolean).join(' '),
      subtitle: c.phone ?? '',
      href: c.properties[0] ? propertyHref({ id: c.properties[0].propertyId, propertyStatus: 'LEAD' }) : '/buyers',
    })),
    ...notes.map((n) => ({
      id: n.id,
      type: 'note' as const,
      title: n.body.slice(0, 60),
      subtitle: n.property ? [n.property.streetAddress, n.property.city].filter(Boolean).join(', ') : '',
      href: n.propertyId ? propertyHref({ id: n.propertyId, propertyStatus: n.property?.propertyStatus ?? 'LEAD' }) : '/',
    })),
    ...tasks.map((t) => ({
      id: t.id,
      type: 'task' as const,
      title: t.title,
      subtitle: t.property ? [t.property.streetAddress, t.property.city].filter(Boolean).join(', ') : 'No property',
      href: t.propertyId ? propertyHref({ id: t.propertyId, propertyStatus: t.property?.propertyStatus ?? 'LEAD' }) : '/tasks',
    })),
  ]

  return NextResponse.json({ data: results })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/search/route.ts
git commit -m "feat(gap1): add GET /api/search route with ILIKE across 5 models"
```

---

## Task 2: GlobalSearch client component

**Files:**
- Create: `apps/web/src/components/layout/GlobalSearch.tsx`

- [ ] **Step 1: Create the component**

```typescript
// apps/web/src/components/layout/GlobalSearch.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Home, User, FileText, CheckSquare } from 'lucide-react'

interface SearchResult {
  id: string
  type: 'property' | 'contact' | 'note' | 'task' | 'buyer'
  title: string
  subtitle: string
  href: string
}

const TYPE_ICONS = {
  property: Home,
  contact: User,
  note: FileText,
  task: CheckSquare,
  buyer: User,
}

const TYPE_LABELS = {
  property: 'Properties',
  contact: 'Contacts',
  note: 'Notes',
  task: 'Tasks',
  buyer: 'Buyers',
}

export function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const debounceRef = useRef<NodeJS.Timeout>()
  const inputRef = useRef<HTMLInputElement>(null)

  const search = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((j) => {
        setResults(j.data ?? [])
        setOpen(true)
        setActiveIdx(-1)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, search])

  function navigate(href: string) {
    setQuery('')
    setOpen(false)
    router.push(href)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)) }
    if (e.key === 'Enter' && activeIdx >= 0) { navigate(results[activeIdx].href) }
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
  }

  // Group by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = []
    acc[r.type].push(r)
    return acc
  }, {})

  return (
    <div className="relative w-64">
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
        <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search properties, contacts…"
          className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none min-w-0"
        />
        {(query || loading) && (
          <button onClick={() => { setQuery(''); setOpen(false) }} className="text-gray-300 hover:text-gray-500">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-96 overflow-y-auto">
          {Object.entries(grouped).map(([type, items]) => {
            const Icon = TYPE_ICONS[type as keyof typeof TYPE_ICONS] ?? Search
            return (
              <div key={type}>
                <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {TYPE_LABELS[type as keyof typeof TYPE_LABELS] ?? type}
                </p>
                {items.map((r, rIdx) => {
                  const globalIdx = results.indexOf(r)
                  return (
                    <button
                      key={r.id}
                      onMouseDown={() => navigate(r.href)}
                      className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                        globalIdx === activeIdx ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{r.title}</p>
                        {r.subtitle && <p className="text-xs text-gray-400 truncate">{r.subtitle}</p>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 px-4 py-6 text-center">
          <p className="text-sm text-gray-400">No results for "{query}"</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/layout/GlobalSearch.tsx
git commit -m "feat(gap1): add GlobalSearch client component with debounce + keyboard nav"
```

---

## Task 3: Add GlobalSearch to app layout header

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx` (or wherever the header/topbar is rendered)

- [ ] **Step 1: Find the layout/header**

Read `apps/web/src/app/(app)/layout.tsx`. Find where the top header bar is rendered — it likely has the user menu, notifications bell, etc.

- [ ] **Step 2: Add GlobalSearch to the header**

Add the import:
```typescript
import { GlobalSearch } from '@/components/layout/GlobalSearch'
```

In the header div (likely has `flex items-center justify-between`), add `<GlobalSearch />` in the center or left section:

```tsx
<header className="h-12 flex-shrink-0 border-b border-gray-200 bg-white flex items-center justify-between px-4 gap-4">
  {/* Logo or breadcrumb on the left */}
  <div className="flex items-center gap-4">
    {/* existing left content */}
    <GlobalSearch />
  </div>
  {/* Right: notifications, user menu */}
  <div className="flex items-center gap-2">
    {/* existing right content */}
  </div>
</header>
```

Adjust based on the actual layout structure found in the file.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(app)/layout.tsx"
git commit -m "feat(gap1): add GlobalSearch to app layout header"
```
