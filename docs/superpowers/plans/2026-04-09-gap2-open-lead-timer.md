# Open Lead Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show compact elapsed time since last activity on all pipeline list rows and detail page headers, color-coded by urgency (green <1d, amber 1–7d, red >7d).

**Architecture:** A shared `formatElapsed` utility produces compact strings ("2h", "3d", "1w"). `LeadTable` already has a last-activity column with verbose formatting — replace with compact. `PipelineTable` has only an "Updated" column — replace with color-coded Last Activity. Both detail headers get a "Last activity: Xd ago" line. No schema or query changes needed — `lastActivityAt` already exists and is returned by all Prisma queries.

**Tech Stack:** Next.js 15 App Router, Prisma, plain Tailwind CSS, date-fns (already installed).

---

## Task 1: Shared `formatElapsed` utility

**Files:**
- Create: `apps/web/src/lib/format-elapsed.ts`

- [ ] **Step 1: Create the utility**

```typescript
// apps/web/src/lib/format-elapsed.ts

/**
 * Returns a compact elapsed-time string from a date to now.
 * Examples: "just now", "45m", "3h", "2d", "1w", "3mo"
 */
export function formatElapsed(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w`
  const months = Math.floor(days / 30)
  return `${months}mo`
}

/**
 * Returns Tailwind text color class based on elapsed time urgency.
 * green = active (<1d), amber = stale (1–7d), red = overdue (>7d)
 */
export function activityColorClass(date: Date | string | null | undefined): string {
  if (!date) return 'text-gray-400'
  const hours = (Date.now() - new Date(date).getTime()) / 3_600_000
  if (hours < 24) return 'text-green-600'
  if (hours < 168) return 'text-amber-500'
  return 'text-red-500'
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/format-elapsed.ts
git commit -m "feat(gap2): add formatElapsed shared utility"
```

---

## Task 2: Update LeadTable to use compact format

**Files:**
- Modify: `apps/web/src/components/leads/LeadTable.tsx`

- [ ] **Step 1: Read the file and replace the activity display**

Read `apps/web/src/components/leads/LeadTable.tsx`. The file currently imports `format` and/or `formatDistanceToNow` from `date-fns` and has an inline `activityColor` function. 

Make these changes:
1. Add import: `import { formatElapsed, activityColorClass } from '@/lib/format-elapsed'`
2. Remove any inline `activityColor` helper function (it's now in the shared utility)
3. Find the "Last Activity" column cell rendering — it uses `formatDistanceToNow` or similar. Replace the cell content with:
```tsx
<td className="px-3 py-3 text-right">
  <span className={`text-xs font-medium ${activityColorClass(row.lastActivityAt ?? row.updatedAt)}`}>
    {formatElapsed(row.lastActivityAt ?? row.updatedAt)}
  </span>
</td>
```
4. Keep the column header as "Last Activity" (or add it if missing).
5. Remove unused date-fns imports if no longer needed.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/leads/LeadTable.tsx
git commit -m "feat(gap2): update LeadTable to use compact formatElapsed"
```

---

## Task 3: Update PipelineTable

**Files:**
- Modify: `apps/web/src/components/pipelines/PipelineTable.tsx`

- [ ] **Step 1: Read the file and update**

Read `apps/web/src/components/pipelines/PipelineTable.tsx`. It currently has an "Updated" column. Make these changes:
1. Add import: `import { formatElapsed, activityColorClass } from '@/lib/format-elapsed'`
2. Add `lastActivityAt?: Date | string | null` to the `PipelineRow` interface (or whatever the row type is called)
3. Replace the "Updated" column header with "Last Activity"
4. Replace the "Updated" cell content with:
```tsx
<td className="px-3 py-3 text-right">
  <span className={`text-xs font-medium ${activityColorClass((row as any).lastActivityAt ?? row.updatedAt)}`}>
    {formatElapsed((row as any).lastActivityAt ?? row.updatedAt)}
  </span>
</td>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/pipelines/PipelineTable.tsx
git commit -m "feat(gap2): update PipelineTable Last Activity column with color coding"
```

---

## Task 4: Update LeadDetailHeader

**Files:**
- Modify: `apps/web/src/components/leads/LeadDetailHeader.tsx`

- [ ] **Step 1: Add lastActivityAt prop and display**

Read the file. It has a `Props` interface and shows "Added {date}" text. Make these changes:
1. Add `lastActivityAt?: Date | string | null` to the `Props` interface
2. Add import: `import { formatElapsed, activityColorClass } from '@/lib/format-elapsed'`
3. After the "Added" line, add:
```tsx
{lastActivityAt && (
  <p className="text-[11px] mt-0.5">
    <span className="text-gray-400">Last activity: </span>
    <span className={activityColorClass(lastActivityAt)}>
      {formatElapsed(lastActivityAt)}
    </span>
  </p>
)}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/leads/LeadDetailHeader.tsx
git commit -m "feat(gap2): add lastActivityAt to LeadDetailHeader"
```

---

## Task 5: Update PipelineDetailHeader

**Files:**
- Modify: `apps/web/src/components/pipelines/PipelineDetailHeader.tsx`

- [ ] **Step 1: Add lastActivityAt prop and display**

Read the file. Apply the same pattern as Task 4:
1. Add `lastActivityAt?: Date | string | null` to Props
2. Add import for `formatElapsed, activityColorClass`
3. Add the "Last activity: Xd" display line after any existing date display

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/pipelines/PipelineDetailHeader.tsx
git commit -m "feat(gap2): add lastActivityAt to PipelineDetailHeader"
```

---

## Task 6: Wire lastActivityAt into all 5 detail pages

**Files:**
- Modify: `apps/web/src/app/(app)/leads/dts/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/dta/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/tm/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/inventory/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/dispo/[id]/page.tsx`

- [ ] **Step 1: Update DTS + DTA pages**

For `leads/dts/[id]/page.tsx` and `leads/dta/[id]/page.tsx`: read each file, find `<LeadDetailHeader ... />` and add the prop:
```tsx
lastActivityAt={lead.lastActivityAt}
```

- [ ] **Step 2: Update TM + Inventory + Dispo pages**

For the 3 pipeline pages: read each, find `<PipelineDetailHeader ... />` and add:
```tsx
lastActivityAt={property.lastActivityAt}
```

- [ ] **Step 3: Commit**

```bash
git add \
  "apps/web/src/app/(app)/leads/dts/[id]/page.tsx" \
  "apps/web/src/app/(app)/leads/dta/[id]/page.tsx" \
  "apps/web/src/app/(app)/tm/[id]/page.tsx" \
  "apps/web/src/app/(app)/inventory/[id]/page.tsx" \
  "apps/web/src/app/(app)/dispo/[id]/page.tsx"
git commit -m "feat(gap2): wire lastActivityAt into all 5 detail page headers"
```
