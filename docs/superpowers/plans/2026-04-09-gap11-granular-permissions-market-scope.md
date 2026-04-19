# Gap 11 — Granular Permissions & Market Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the flat permission checkboxes in RolesPanel by module, and enforce `getMarketScope()` on every pipeline list query so non-admin users only see properties/buyers in their assigned markets.

**Architecture:** `getMarketScope(session)` already exists in `auth-utils.ts` and returns `null` (admin — no filter) or `string[] | []` (user's market IDs). Each pipeline lib function gains a `marketScope` param; server page components call `getMarketScope(session)` and forward it. RolesPanel gets a `MODULE_GROUPS` constant that renders permissions in labelled sections instead of a flat grid.

**Tech Stack:** Next.js 15 App Router (server components), Prisma, TypeScript, Tailwind CSS (plain HTML — no shadcn/ui).

---

## File Map

| File | Change |
|------|--------|
| `apps/web/src/components/settings/RolesPanel.tsx` | Replace flat grid with module-grouped sections |
| `apps/web/src/lib/leads.ts` | Add `marketScope` to `LeadListFilter`, apply in `getLeadList` |
| `apps/web/src/lib/pipelines.ts` | Add `marketScope` to `PipelineFilter`, apply in `getTmList`, `getInventoryList`, `getDispoList` |
| `apps/web/src/lib/archive.ts` | Add `marketScope` to `ArchiveFilter`, apply in `getSoldList`, `getRentalList` |
| `apps/web/src/lib/buyers.ts` | Add `marketScope` to `BuyerListFilter`, apply in `getBuyerList` |
| `apps/web/src/app/(app)/leads/dts/page.tsx` | Pass `getMarketScope(session)` to `getLeadList` |
| `apps/web/src/app/(app)/leads/dta/page.tsx` | Same |
| `apps/web/src/app/(app)/leads/warm/page.tsx` | Same |
| `apps/web/src/app/(app)/leads/dead/page.tsx` | Same |
| `apps/web/src/app/(app)/leads/referred/page.tsx` | Same |
| `apps/web/src/app/(app)/tm/page.tsx` | Pass `getMarketScope(session)` to `getTmList` |
| `apps/web/src/app/(app)/inventory/page.tsx` | Pass to `getInventoryList` |
| `apps/web/src/app/(app)/dispo/page.tsx` | Pass to `getDispoList` |
| `apps/web/src/app/(app)/sold/page.tsx` | Pass to `getSoldList` |
| `apps/web/src/app/(app)/rental/page.tsx` | Pass to `getRentalList` |
| `apps/web/src/app/(app)/buyers/page.tsx` | Pass to `getBuyerList` |

---

## Task 1: Group permissions by module in RolesPanel

**Files:**
- Modify: `apps/web/src/components/settings/RolesPanel.tsx`

The current implementation renders all 24 permissions in a flat 2-column grid. Replace with module-grouped collapsible sections.

- [ ] **Step 1: Replace `ALL_PERMISSIONS` with `MODULE_GROUPS`**

In `RolesPanel.tsx`, replace:

```tsx
const ALL_PERMISSIONS: Permission[] = [
  'leads.view', 'leads.create', 'leads.edit', 'leads.delete',
  'tm.view', 'tm.edit',
  ...
]
```

with:

```tsx
const MODULE_GROUPS: { label: string; perms: Permission[] }[] = [
  { label: 'Leads', perms: ['leads.view', 'leads.create', 'leads.edit', 'leads.delete'] },
  { label: 'Transaction Mgmt', perms: ['tm.view', 'tm.edit'] },
  { label: 'Inventory', perms: ['inventory.view', 'inventory.edit'] },
  { label: 'Dispo', perms: ['dispo.view', 'dispo.edit'] },
  { label: 'Contacts', perms: ['contacts.view', 'contacts.edit'] },
  { label: 'Communications', perms: ['comms.view', 'comms.send'] },
  { label: 'Tasks', perms: ['tasks.view', 'tasks.manage'] },
  { label: 'Campaigns', perms: ['campaigns.view', 'campaigns.manage'] },
  { label: 'Analytics', perms: ['analytics.view'] },
  { label: 'Settings', perms: ['settings.view', 'settings.manage'] },
  { label: 'Users', perms: ['users.view', 'users.manage'] },
  { label: 'Admin', perms: ['admin.all'] },
]
```

- [ ] **Step 2: Replace the flat permission grid with module sections**

Find the permission toggles block (currently `<div className="grid grid-cols-2 gap-2">`):

```tsx
{/* Permission toggles */}
{expandedId === role.id && (
  <div className="border-t border-gray-100 px-4 py-3">
    <div className="grid grid-cols-2 gap-2">
      {ALL_PERMISSIONS.map((perm) => {
        const active = role.permissions.includes(perm)
        const isDisabled = role.isSystem || saving === role.id
        return (
          <label key={perm} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              disabled={isDisabled}
              onChange={() => !isDisabled && togglePermission(role, perm)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-xs text-gray-700 font-mono">{perm}</span>
          </label>
        )
      })}
    </div>
    {role.isSystem && (
      <p className="text-xs text-gray-400 mt-3">System roles cannot be modified.</p>
    )}
  </div>
)}
```

Replace with:

```tsx
{/* Permission toggles — grouped by module */}
{expandedId === role.id && (
  <div className="border-t border-gray-100 px-4 py-3 space-y-4">
    {MODULE_GROUPS.map((group) => (
      <div key={group.label}>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          {group.label}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {group.perms.map((perm) => {
            const active = role.permissions.includes(perm)
            const isDisabled = role.isSystem || saving === role.id
            return (
              <label key={perm} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  disabled={isDisabled}
                  onChange={() => !isDisabled && togglePermission(role, perm)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <span className="text-xs text-gray-700 font-mono">{perm}</span>
              </label>
            )
          })}
        </div>
      </div>
    ))}
    {role.isSystem && (
      <p className="text-xs text-gray-400 mt-1">System roles cannot be modified.</p>
    )}
  </div>
)}
```

Also update the permission count display — it still uses `ALL_PERMISSIONS.length`. Replace with a flat array derived from groups:

```tsx
// Near the top of the component, after MODULE_GROUPS:
const ALL_PERMISSIONS = MODULE_GROUPS.flatMap((g) => g.perms)
```

This keeps the `togglePermission` function working unchanged (it uses `ALL_PERMISSIONS` only implicitly via the flat array from `role.permissions`). No logic changes needed — just the flat-array derivation.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/settings/RolesPanel.tsx
git commit -m "feat(gap11): group RolesPanel permissions by module"
```

---

## Task 2: Add market scope to `getLeadList`

**Files:**
- Modify: `apps/web/src/lib/leads.ts`

- [ ] **Step 1: Add `marketScope` to `LeadListFilter` and apply it**

In `apps/web/src/lib/leads.ts`, update `LeadListFilter`:

```ts
export interface LeadListFilter {
  pipeline: LeadPipeline
  search?: string
  stage?: string
  assignedToId?: string
  marketId?: string
  isHot?: boolean
  page?: number
  pageSize?: number
  marketScope?: string[] | null   // null = admin (no filter); [] = no access; string[] = filter
}
```

In `getLeadList`, update the destructure and where clause. Change:

```ts
export async function getLeadList(filter: LeadListFilter) {
  const { pipeline, search, stage, assignedToId, marketId, isHot, page = 1, pageSize = 50 } = filter
  const base = PIPELINE_WHERE[pipeline]

  const where: Prisma.PropertyWhereInput = {
    ...base,
    ...(stage && { activeLeadStage: stage as any }),
    ...(assignedToId && { assignedToId }),
    ...(marketId && { marketId }),
    ...(isHot && { isHot: true }),
```

to:

```ts
export async function getLeadList(filter: LeadListFilter) {
  const { pipeline, search, stage, assignedToId, marketId, isHot, page = 1, pageSize = 50, marketScope } = filter
  const base = PIPELINE_WHERE[pipeline]

  const where: Prisma.PropertyWhereInput = {
    ...base,
    ...(stage && { activeLeadStage: stage as any }),
    ...(assignedToId && { assignedToId }),
    // User-selected market filter takes precedence; fall back to marketScope enforcement
    ...(marketId
      ? { marketId }
      : marketScope !== null && marketScope !== undefined
        ? { marketId: { in: marketScope } }
        : {}),
    ...(isHot && { isHot: true }),
```

Note: `{ marketId: { in: [] } }` in Prisma returns 0 rows — correct behavior when a user has no assigned markets.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/leads.ts
git commit -m "feat(gap11): enforce marketScope in getLeadList"
```

---

## Task 3: Add market scope to pipeline list functions (TM, Inventory, Dispo)

**Files:**
- Modify: `apps/web/src/lib/pipelines.ts`

- [ ] **Step 1: Add `marketScope` to `PipelineFilter`**

Update the interface:

```ts
export interface PipelineFilter {
  search?: string
  assignedToId?: string
  page?: number
  pageSize?: number
  marketScope?: string[] | null
}
```

- [ ] **Step 2: Apply market scope in `getTmList`**

In `getTmList`, change:

```ts
const where: Prisma.PropertyWhereInput = {
  propertyStatus: 'IN_TM',
  ...(assignedToId && { assignedToId }),
  ...(search && { OR: buildSearchOr(search) }),
}
```

to:

```ts
const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter

const where: Prisma.PropertyWhereInput = {
  propertyStatus: 'IN_TM',
  ...(assignedToId && { assignedToId }),
  ...(marketScope !== null && marketScope !== undefined && { marketId: { in: marketScope } }),
  ...(search && { OR: buildSearchOr(search) }),
}
```

- [ ] **Step 3: Apply market scope in `getInventoryList`**

Same pattern. Change the where clause in `getInventoryList`:

```ts
const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter

const where: Prisma.PropertyWhereInput = {
  propertyStatus: 'IN_INVENTORY',
  ...(assignedToId && { assignedToId }),
  ...(marketScope !== null && marketScope !== undefined && { marketId: { in: marketScope } }),
  ...(search && { OR: buildSearchOr(search) }),
}
```

- [ ] **Step 4: Apply market scope in `getDispoList`**

Same pattern:

```ts
const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter

const where: Prisma.PropertyWhereInput = {
  inDispo: true,
  ...(assignedToId && { assignedToId }),
  ...(marketScope !== null && marketScope !== undefined && { marketId: { in: marketScope } }),
  ...(search && { OR: buildSearchOr(search) }),
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/pipelines.ts
git commit -m "feat(gap11): enforce marketScope in getTmList, getInventoryList, getDispoList"
```

---

## Task 4: Add market scope to archive list functions (Sold, Rental)

**Files:**
- Modify: `apps/web/src/lib/archive.ts`

- [ ] **Step 1: Update `ArchiveFilter` and apply in `getSoldList` and `getRentalList`**

Update the interface:

```ts
export interface ArchiveFilter {
  search?: string
  assignedToId?: string
  page?: number
  pageSize?: number
  marketScope?: string[] | null
}
```

In `getSoldList`, change:

```ts
const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter

const where: Prisma.PropertyWhereInput = {
  propertyStatus: 'SOLD',
  ...(assignedToId && { assignedToId }),
  ...(marketScope !== null && marketScope !== undefined && { marketId: { in: marketScope } }),
  ...(search && { OR: buildSearchOr(search) }),
}
```

In `getRentalList`, same:

```ts
const { search, assignedToId, page = 1, pageSize = 50, marketScope } = filter

const where: Prisma.PropertyWhereInput = {
  propertyStatus: 'RENTAL',
  ...(assignedToId && { assignedToId }),
  ...(marketScope !== null && marketScope !== undefined && { marketId: { in: marketScope } }),
  ...(search && { OR: buildSearchOr(search) }),
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/archive.ts
git commit -m "feat(gap11): enforce marketScope in getSoldList, getRentalList"
```

---

## Task 5: Add market scope to `getBuyerList`

**Files:**
- Modify: `apps/web/src/lib/buyers.ts`

The `Buyer` model has `markets String[]` (a Postgres array of market IDs). Prisma's `hasSome` filter checks array overlap.

- [ ] **Step 1: Update `BuyerListFilter` and apply market scope**

Update the interface:

```ts
export interface BuyerListFilter {
  search?: string
  activeOnly?: boolean
  page?: number
  pageSize?: number
  marketScope?: string[] | null
}
```

In `getBuyerList`, change:

```ts
export async function getBuyerList(filter: BuyerListFilter) {
  const { search, activeOnly, page = 1, pageSize = 50, marketScope } = filter

  const where: Prisma.BuyerWhereInput = {
    ...(activeOnly && { isActive: true }),
    // Market scope: null = admin sees all; [] = no access; string[] = intersection with buyer's markets
    ...(marketScope !== null && marketScope !== undefined && (
      marketScope.length > 0
        ? { markets: { hasSome: marketScope } }
        : { id: '' }  // empty marketScope = user has no markets = show nothing
    )),
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/buyers.ts
git commit -m "feat(gap11): enforce marketScope in getBuyerList"
```

---

## Task 6: Wire market scope into all pipeline page components

**Files:**
- Modify: `apps/web/src/app/(app)/leads/dts/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/dta/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/warm/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/dead/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/referred/page.tsx`
- Modify: `apps/web/src/app/(app)/tm/page.tsx`
- Modify: `apps/web/src/app/(app)/inventory/page.tsx`
- Modify: `apps/web/src/app/(app)/dispo/page.tsx`
- Modify: `apps/web/src/app/(app)/sold/page.tsx`
- Modify: `apps/web/src/app/(app)/rental/page.tsx`
- Modify: `apps/web/src/app/(app)/buyers/page.tsx`

Each page already imports `auth` and has `const session = await auth()`. The pattern is: add `getMarketScope` import and pass it to the list function.

- [ ] **Step 1: Update `leads/dts/page.tsx`**

Add import at top:
```ts
import { getMarketScope } from '@/lib/auth-utils'
```

Then replace the `getLeadList` call (inside the `Promise.all`):
```ts
getLeadList({
  pipeline: 'dts',
  search: sp.search,
  stage: sp.stage,
  assignedToId: sp.assignedToId,
  isHot: sp.isHot === '1',
  page: sp.page ? parseInt(sp.page) : 1,
  marketScope: getMarketScope(session),
}),
```

- [ ] **Step 2: Update `leads/dta/page.tsx`** (same pattern)

Add import:
```ts
import { getMarketScope } from '@/lib/auth-utils'
```

Add `marketScope: getMarketScope(session)` to the `getLeadList` call.

- [ ] **Step 3: Update `leads/warm/page.tsx`** (same pattern)

Add import:
```ts
import { getMarketScope } from '@/lib/auth-utils'
```

Add `marketScope: getMarketScope(session)` to the `getLeadList` call.

- [ ] **Step 4: Update `leads/dead/page.tsx`** (same pattern)

Add import:
```ts
import { getMarketScope } from '@/lib/auth-utils'
```

Add `marketScope: getMarketScope(session)` to the `getLeadList` call.

- [ ] **Step 5: Update `leads/referred/page.tsx`** (same pattern)

Add import:
```ts
import { getMarketScope } from '@/lib/auth-utils'
```

Add `marketScope: getMarketScope(session)` to the `getLeadList` call.

- [ ] **Step 6: Update `tm/page.tsx`**

Add import:
```ts
import { getMarketScope } from '@/lib/auth-utils'
```

Add `marketScope: getMarketScope(session)` to the `getTmList` call.

- [ ] **Step 7: Update `inventory/page.tsx`**

Add import:
```ts
import { getMarketScope } from '@/lib/auth-utils'
```

Add `marketScope: getMarketScope(session)` to the `getInventoryList` call.

- [ ] **Step 8: Update `dispo/page.tsx`**

Add import:
```ts
import { getMarketScope } from '@/lib/auth-utils'
```

Add `marketScope: getMarketScope(session)` to the `getDispoList` call.

- [ ] **Step 9: Update `sold/page.tsx`**

Add import:
```ts
import { getMarketScope } from '@/lib/auth-utils'
```

Add `marketScope: getMarketScope(session)` to the `getSoldList` call.

- [ ] **Step 10: Update `rental/page.tsx`**

Add import:
```ts
import { getMarketScope } from '@/lib/auth-utils'
```

Add `marketScope: getMarketScope(session)` to the `getRentalList` call.

- [ ] **Step 11: Update `buyers/page.tsx`**

Add import:
```ts
import { getMarketScope } from '@/lib/auth-utils'
```

Change the `getBuyerList` call from:
```ts
const { rows, total } = await getBuyerList({
  search: sp.search,
  page: sp.page ? parseInt(sp.page) : 1,
})
```

to:
```ts
const { rows, total } = await getBuyerList({
  search: sp.search,
  page: sp.page ? parseInt(sp.page) : 1,
  marketScope: getMarketScope(session),
})
```

- [ ] **Step 12: Commit**

```bash
git add \
  "apps/web/src/app/(app)/leads/dts/page.tsx" \
  "apps/web/src/app/(app)/leads/dta/page.tsx" \
  "apps/web/src/app/(app)/leads/warm/page.tsx" \
  "apps/web/src/app/(app)/leads/dead/page.tsx" \
  "apps/web/src/app/(app)/leads/referred/page.tsx" \
  "apps/web/src/app/(app)/tm/page.tsx" \
  "apps/web/src/app/(app)/inventory/page.tsx" \
  "apps/web/src/app/(app)/dispo/page.tsx" \
  "apps/web/src/app/(app)/sold/page.tsx" \
  "apps/web/src/app/(app)/rental/page.tsx" \
  "apps/web/src/app/(app)/buyers/page.tsx"
git commit -m "feat(gap11): pass marketScope from session to all pipeline list pages"
```

---

## Spec Coverage Check

| Requirement | Covered by |
|------------|------------|
| Group permissions by module in RolesPanel | Task 1 |
| Admin.all module visible and labelled | Task 1 — `{ label: 'Admin', perms: ['admin.all'] }` |
| getMarketScope enforced on Leads pipelines (DTS, DTA, Warm, Dead, Referred) | Tasks 2 + 6 |
| getMarketScope enforced on TM, Inventory, Dispo | Tasks 3 + 6 |
| getMarketScope enforced on Sold, Rental | Tasks 4 + 6 |
| getMarketScope enforced on Buyers | Tasks 5 + 6 |
| Empty marketScope (user with no markets) shows 0 results | Tasks 2–5 — `{ in: [] }` / `{ id: '' }` |
| Admin sees everything (no filter) | Tasks 2–5 — `marketScope === null` guard |

> **Note:** Market Access multi-select on the user edit form was considered but skipped. `User.marketIds String[]` is already in the schema and already populated through the session. Adding a UI field to the Team settings page to assign market IDs to users is a UX improvement that doesn't affect enforcement — the enforcement (this plan) is what matters for security. The UI can be added as a follow-up if needed.
