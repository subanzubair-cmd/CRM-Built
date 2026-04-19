# Dashboard + Lead List Improvements — Design Spec

**Date:** 2026-04-10
**Status:** Draft
**Scope:** Action-oriented dashboard, enhanced lead table, enriched Kanban cards

---

## Context

The current CRM dashboard shows 4 basic KPI cards and a simple bar chart. The lead table has 6 columns with no sorting or bulk actions. Kanban cards show 5 data points. All three areas are significantly behind REsimpli's feature set and data density.

This spec covers improvements to make the dashboard actionable, the lead table powerful, and the Kanban cards information-rich — matching and exceeding REsimpli's patterns.

---

## 1. Action-Oriented Dashboard

### 1.1 Layout Structure (6 rows)

**Row 1 — Primary KPI Cards (4 across)**

| Card | Data Source | Click Action |
|------|-----------|--------------|
| Tasks Due Today | `tasks.count WHERE status='PENDING' AND dueAt <= endOfToday` | Navigate to `/tasks?filter=due-today` |
| New Leads Today | `property.count WHERE leadStatus='ACTIVE' AND createdAt >= startOfToday` | Navigate to `/leads/dts?sort=createdAt&order=desc` |
| Open Messages | `conversation.count WHERE isRead=false` | Navigate to `/inbox?filter=unread` |
| Under Contract | `property.count WHERE activeLeadStage='UNDER_CONTRACT'` | Navigate to `/leads/dts?stage=UNDER_CONTRACT` |

Each card shows:
- Label (uppercase, 10px)
- Count (28px, bold)
- Contextual subtitle with arrow (e.g., "3 overdue →", "Avg 1st touch: 2.4hr →")
- Left border accent color (red/blue/amber/green)
- Entire card is clickable (Link component)

Subtitle data:
- Tasks Due: count where `dueAt < now` → "X overdue →"
- New Leads: average time to first outbound message for today's leads → "Avg 1st touch: Xhr →"
- Open Messages: count where `isRead=false AND lastMessageAt < 4 hours ago` → "X unreplied >4hr →"
- Under Contract: `SUM(expectedProfit) WHERE activeLeadStage='UNDER_CONTRACT'` → "$XK pipeline →"

**Row 2 — Secondary KPI Cards (3 across)**

| Card | Data Source | Click Action |
|------|-----------|--------------|
| Hot Leads 🔥 | `property.count WHERE isHot=true AND leadStatus='ACTIVE'` | `/leads/dts?isHot=1` |
| Unclaimed Leads | `property.count WHERE assignedToId IS NULL AND leadStatus='ACTIVE'` | `/leads/dts?assignedToId=unassigned` |
| Open Leads (Total) | `property.count WHERE leadStatus='ACTIVE'` | `/leads/dts` |

**Row 3 — Needs Attention (action work queue)**

Three colored alert cards in a row:

| Alert | Query | Click Action |
|-------|-------|--------------|
| No Activity >7 Days | `property.count WHERE leadStatus='ACTIVE' AND (lastActivityAt < 7daysAgo OR lastActivityAt IS NULL)` | `/leads/dts?sort=lastActivityAt&order=asc` |
| Overdue Tasks | `tasks.count WHERE status='PENDING' AND dueAt < now` | `/tasks?filter=overdue` |
| Unassigned Leads | Same as unclaimed | `/leads/dts?assignedToId=unassigned` |

Color coding: Red (no activity), Amber (overdue tasks), Blue (unassigned).

**Row 4 — Charts (2-column grid)**

Left (50%): **Conversion Trend (8 weeks)**
- Bar chart showing leads reaching UNDER_CONTRACT per week
- Current week highlighted in solid blue, others in light blue
- Data source: `property.count WHERE activeLeadStage='UNDER_CONTRACT' GROUP BY week(createdAt)`
- Reuse existing `conversionWeekly` from `getAnalyticsOverview()`

Right (50%): **Top Lead Sources**
- Horizontal bar chart with percentage distribution
- Top 5 sources by count
- Color-coded bars (blue, green, amber, purple, gray)
- Data source: existing `sourceBreakdown` from `getAnalyticsOverview()`

**Row 5 — Abandoned Leads + Call Stats + Goals (3fr 2fr grid)**

Left (60%): **Abandoned Leads Table**

Stage × drip/task matrix. Each cell is clickable → navigates to filtered lead view.

Columns:
- Stage (row labels: New Leads, Discovery, Follow Up, Due Diligence, Offer Made, Under Contract)
- No Drip (leads with no active CampaignEnrollment)
- No Tasks (leads with 0 pending tasks)
- Neither (leads with no drip AND no pending tasks)

Query approach: For each active lead stage, count:
```sql
-- No Drip
COUNT(*) WHERE activeLeadStage=X AND NOT EXISTS (
  SELECT 1 FROM CampaignEnrollment WHERE propertyId=Property.id AND isActive=true
)
-- No Tasks
COUNT(*) WHERE activeLeadStage=X AND NOT EXISTS (
  SELECT 1 FROM Task WHERE propertyId=Property.id AND status='PENDING'
)
-- Neither (intersection)
COUNT(*) WHERE activeLeadStage=X
  AND NOT EXISTS (active enrollment)
  AND NOT EXISTS (pending task)
```

Performance: Use raw SQL or Prisma `$queryRaw` to batch all counts in a single query instead of N+1.

Right (40%): Stacked vertically:
- **Call Stats (This Month)**: Total / Outbound / Inbound — reuse existing analytics
- **Goals Progress**: Revenue + Deals progress bars — reuse existing `goals` from analytics

**Row 6 — Tasks Due Today List**

- Up to 10 tasks sorted by `dueAt ASC`
- Each row: task title, property address, due time
- Overdue tasks highlighted red
- "View all tasks →" link top-right
- Reuse existing `getTaskList({ dueToday: true })` query

### 1.2 Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/app/(app)/dashboard/page.tsx` | Complete rewrite — new layout with all 6 rows |
| `apps/web/src/lib/analytics.ts` | Add `getAbandonedLeadsMatrix()`, add `openMessagesCount`, add `overdueTaskCount`, add `staleLeadsCount` |
| `apps/web/src/app/(app)/dashboard/loading.tsx` | Update skeleton to match new layout |

### 1.3 New Components

None needed — dashboard is a server component with inline rendering. All data fetched server-side.

---

## 2. Enhanced Lead Table

### 2.1 Columns (13 total)

| # | Column | Field | Sortable | Width |
|---|--------|-------|----------|-------|
| 0 | Checkbox | — | No | 40px |
| 1 | Seller Name | `contacts[0].firstName + lastName` | Yes | 140px |
| 2 | Property Address | `streetAddress + city, state` | Yes | 180px |
| 3 | Status | `activeLeadStage` (badge) | Yes | 120px |
| 4 | Campaign | `campaignName` | Yes | 130px |
| 5 | Last Comm | Last message channel + elapsed + direction | Yes (by `lastActivityAt`) | 120px |
| 6 | Source | `source` | Yes | 110px |
| 7 | Market | `market.name` | Yes | 100px |
| 8 | ARV | `arv` (formatted $XK) | Yes | 80px |
| 9 | Ask Price | `askingPrice` (formatted $XK) | Yes | 80px |
| 10 | Offers | `_count.offers` (badge) | Yes | 60px |
| 11 | Assigned | `assignedTo.name` | Yes | 100px |
| 12 | Tasks | `_count.tasks` (badge) | Yes | 60px |

Hot leads show 🔥 prefix on seller name.

Last Comm column shows:
- Channel icon (phone/message/mail) + elapsed time
- Direction label (Inbound/Outbound) in secondary text
- Red "No contact • Xd" if no messages exist or last message >7 days

Table has `overflow-x: auto` for horizontal scrolling on smaller screens.

### 2.2 Column Sorting

- Clickable column headers with sort indicator (▲/▼)
- URL-driven: `?sort=fieldName&order=asc|desc`
- Default sort: `lastActivityAt DESC` (current behavior preserved)
- Server-side sorting in `getLeadList()` via Prisma `orderBy`
- Only one active sort column at a time

Sort field mapping (URL param → Prisma orderBy):
```
sellerName    → skip sorting (contact is a relation through PropertyContact — too complex for Prisma orderBy; not sortable in v1)
address       → streetAddress
stage         → activeLeadStage
campaign      → campaignName
lastComm      → lastActivityAt
source        → source
market        → market.name (relation sort)
arv           → arv
askingPrice   → askingPrice
offers        → _count.offers (aggregate sort — Prisma supports this)
assigned      → assignedTo.name
tasks         → _count.tasks
```

### 2.3 Bulk Selection + Actions

**Selection State:**
- Managed via `useState<Set<string>>` in LeadTable (client component)
- Header checkbox: select all on current page / deselect all
- Row checkboxes: toggle individual selection
- Selection count displayed in toolbar

**Bulk Action Toolbar:**
Rendered above table when `selectedIds.size > 0`. Slides in with transition.

| Action | UI | API |
|--------|----|-----|
| Add Tags | Modal with tag input + autocomplete | `PATCH /api/leads/bulk` `{ ids, action: 'addTags', tags: [...] }` |
| Remove Tags | Modal with current tags checkboxes | `PATCH /api/leads/bulk` `{ ids, action: 'removeTags', tags: [...] }` |
| Assign To | Dropdown of active users | `PATCH /api/leads/bulk` `{ ids, action: 'assign', assignedToId }` |
| Export | Direct download | `GET /api/leads/export?ids=a,b,c` (or POST with body for large sets) |
| Delete | Confirmation modal ("Delete X leads?") | `DELETE /api/leads/bulk` `{ ids }` |

**New API Route:** `apps/web/src/app/api/leads/bulk/route.ts`

PATCH handler processes bulk tag/assign operations.
DELETE handler processes bulk soft-delete (set `leadStatus='DEAD'`).

### 2.4 Query Changes

`getLeadList()` in `apps/web/src/lib/leads.ts` needs:

**New select fields:**
```typescript
select: {
  // ... existing fields
  source: true,
  campaignName: true,
  arv: true,
  askingPrice: true,
  createdAt: true,
  market: { select: { id: true, name: true } },
  _count: {
    select: {
      tasks: { where: { status: 'PENDING' } },
      offers: true,
    }
  }
}
```

**New sort parameter:**
```typescript
interface LeadListFilter {
  // ... existing
  sort?: string     // column key
  order?: 'asc' | 'desc'
}
```

**New `orderBy` logic** replaces hardcoded sort:
```typescript
const orderBy = buildOrderBy(filter.sort, filter.order)
// Falls back to [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }]
```

### 2.5 Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/components/leads/LeadTable.tsx` | Major rewrite — 13 columns, sortable headers, checkbox selection, bulk toolbar |
| `apps/web/src/lib/leads.ts` | Add sort/order params, add select fields (source, campaignName, arv, market, offers count) |
| `apps/web/src/app/(app)/leads/dts/page.tsx` | Pass sort/order searchParams to getLeadList |
| `apps/web/src/app/(app)/leads/dta/page.tsx` | Same |
| `apps/web/src/app/(app)/leads/warm/page.tsx` | Same |
| `apps/web/src/app/(app)/leads/dead/page.tsx` | Same |
| `apps/web/src/app/(app)/leads/referred/page.tsx` | Same |
| `apps/web/src/app/api/leads/bulk/route.ts` | **New** — bulk operations API |

---

## 3. Enriched Kanban Cards

### 3.1 Card Layout (matching REsimpli)

Each card displays 11 data points from real database stats:

```
┌──────────────────────────────┐
│ 123 Main St, Dallas, TX 75… [📞] │  ← address (truncated) + call button
│ John Smith 🔥                    │  ← contact name + hot emoji (conditional)
│ (469) 555-1234                   │  ← phone number
│ Updated: Apr 10 2:35 pm          │  ← updatedAt formatted
│──────────────────────────────│
│ Created         In pipeline      │
│ Feb 28, 2026    42 days          │  ← createdAt + daysDiff(now, createdAt)
│──────────────────────────────│
│ 📞 x8    💬 x5                   │  ← call count + SMS count
│ Last 📞 Apr 08    ☑ 2/3 Tasks   │  ← last call date + completed/total tasks
└──────────────────────────────┘
```

- Fire emoji (`🔥`) shown inline after contact name ONLY when `isHot === true`
- Call button (top-right): sky-blue border, triggers call action (stopPropagation)
- "Updated" label in amber
- SVG icons from Lucide (Phone, MessageSquare, CheckSquare) instead of emoji
- Card: 14px radius, subtle shadow, hover lifts with deeper shadow
- Card click → navigate to lead detail page
- Drag → move between stage columns (existing @dnd-kit behavior)

### 3.2 Data Requirements

The Kanban board needs additional data per lead that isn't currently fetched:

| Data Point | Source | Query |
|-----------|--------|-------|
| Call count | `Message` | `COUNT(*) WHERE propertyId=X AND channel='CALL'` |
| SMS count | `Message` | `COUNT(*) WHERE propertyId=X AND channel='SMS'` |
| Last call date | `Message` | `MAX(createdAt) WHERE propertyId=X AND channel='CALL'` |
| Tasks completed | `Task` | `COUNT(*) WHERE propertyId=X AND status='COMPLETED'` |
| Tasks total | `Task` | `COUNT(*) WHERE propertyId=X` |
| Updated timestamp | `Property` | `updatedAt` (already available) |
| Created date | `Property` | `createdAt` (already available) |

**Query approach:** Enhance `getLeadList()` to include these counts using Prisma `_count` with filters:

```typescript
_count: {
  select: {
    tasks: true,                                          // total tasks
    tasks: { where: { status: 'PENDING' } },             // pending (existing)
    messages: { where: { channel: 'CALL' } },            // call count
    messages: { where: { channel: 'SMS' } },             // SMS count
  }
}
```

Note: Prisma doesn't support multiple `_count` on the same relation with different filters in one query. Solution: use a single `include` with aggregation, or compute in a follow-up query.

**Recommended approach:** Add a raw SQL helper `getLeadCommStats(propertyIds: string[])` that batches all message/task counts for a page of leads in ONE query:

```sql
SELECT
  p.id,
  COUNT(m.id) FILTER (WHERE m.channel = 'CALL') as call_count,
  COUNT(m.id) FILTER (WHERE m.channel = 'SMS') as sms_count,
  MAX(m."createdAt") FILTER (WHERE m.channel = 'CALL') as last_call_at,
  COUNT(t.id) as total_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'COMPLETED') as completed_tasks
FROM "Property" p
LEFT JOIN "Message" m ON m."propertyId" = p.id
LEFT JOIN "Task" t ON t."propertyId" = p.id
WHERE p.id = ANY($1)
GROUP BY p.id
```

This executes as a single query for all 50 leads on a page — no N+1 problem.

### 3.3 Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/components/leads/KanbanBoard.tsx` | Major rewrite — new card layout with all 11 data points, SVG icons, hot indicator |
| `apps/web/src/lib/leads.ts` | Add `getLeadCommStats()` raw SQL helper, enhance `getLeadList()` to return comm stats |
| `apps/web/src/app/(app)/leads/dts/page.tsx` | Pass comm stats to KanbanBoard |
| `apps/web/src/app/(app)/leads/dta/page.tsx` | Same |
| `apps/web/src/app/(app)/leads/warm/page.tsx` | Same |

---

## 4. New API Route — Bulk Operations

**File:** `apps/web/src/app/api/leads/bulk/route.ts`

### PATCH — Bulk update

```typescript
const BulkUpdateSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  action: z.enum(['addTags', 'removeTags', 'assign']),
  tags: z.array(z.string()).optional(),       // for addTags/removeTags
  assignedToId: z.string().optional(),        // for assign
})
```

**addTags:** For each property, merge new tags with existing tags (deduplicated).
**removeTags:** For each property, filter out specified tags.
**assign:** Update `assignedToId` on all selected properties.
Permission: `requirePermission(session, 'leads.edit')`

### DELETE — Bulk soft-delete

```typescript
const BulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
})
```

Sets `leadStatus='DEAD'` on all selected properties + creates activity log entries.

Permission: `requirePermission(session, 'leads.delete')`

---

## 5. Verification Plan

| Test | How |
|------|-----|
| Dashboard KPI cards | Verify each card shows correct count from database; click each card → correct filtered page |
| Needs Attention | Create a lead with no activity for 8 days → appears in "No Activity >7 Days" count |
| Abandoned Leads | Create lead with no enrollment + no tasks → appears in "Neither" cell for its stage |
| Conversion Trend | Move a lead to UNDER_CONTRACT → weekly chart updates |
| Lead table columns | All 13 columns render with correct data; horizontal scroll works on narrow viewport |
| Column sorting | Click "ARV" header → table re-sorts by ARV ascending; click again → descending |
| Bulk selection | Check 3 rows → toolbar appears showing "3 selected"; check header → all page rows selected |
| Bulk tag | Select 3 leads → Add Tags → type "motivated" → save → all 3 leads now have "motivated" tag |
| Bulk assign | Select leads → Assign To → pick user → all leads reassigned |
| Bulk delete | Select leads → Delete → confirm → leads moved to Dead pipeline |
| Bulk export | Select leads → Export → CSV downloads with all visible columns |
| Kanban card data | Each card shows real call count, SMS count, last call date, tasks completed/total from database |
| Kanban hot indicator | Lead with isHot=true shows 🔥 after name; isHot=false shows no emoji |
| Kanban call button | Click phone button on card → initiates call (doesn't navigate to detail page) |
| Kanban drag | Drag card between columns → stage updates in DB; refresh confirms persistence |
| Performance | Dashboard loads in <2s; lead list with 50 rows + comm stats loads in <1.5s |
