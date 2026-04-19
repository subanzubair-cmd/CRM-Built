# Gap 10: Associated Leads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an "Associated Properties" card on each detail page overview tab listing other properties that share a phone number with any contact on the current property — helping identify sellers with multiple deals.

**Architecture:** A server-side query finds `Contact` records whose phone matches any contact on the current property, then resolves the linked properties. The card is a server component rendered in the overview tab of all 5 detail pages. No schema changes needed.

**Tech Stack:** Next.js 15 App Router, Prisma (PostgreSQL), plain Tailwind CSS, lucide-react.

---

## Task 1: `getAssociatedProperties` lib function

**Files:**
- Create: `apps/web/src/lib/associated-properties.ts`

- [ ] **Step 1: Create the function**

```typescript
// apps/web/src/lib/associated-properties.ts
import { prisma } from '@/lib/prisma'

export interface AssociatedProperty {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  leadStatus: string
  propertyStatus: string
  activeLeadStage: string | null
  matchedPhone: string
}

/**
 * Returns properties (excluding currentPropertyId) that share a phone number
 * with any contact on the current property.
 */
export async function getAssociatedProperties(
  currentPropertyId: string
): Promise<AssociatedProperty[]> {
  // Step 1: get all phone numbers from contacts linked to the current property
  const currentContacts = await prisma.propertyContact.findMany({
    where: { propertyId: currentPropertyId },
    select: { contact: { select: { phone: true, phone2: true } } },
  })

  const phones = new Set<string>()
  for (const pc of currentContacts) {
    if (pc.contact.phone) phones.add(pc.contact.phone)
    if (pc.contact.phone2) phones.add(pc.contact.phone2)
  }

  if (phones.size === 0) return []

  // Step 2: find contacts with matching phones, get their linked properties
  const matchingContacts = await prisma.propertyContact.findMany({
    where: {
      contact: {
        OR: [
          { phone: { in: [...phones] } },
          { phone2: { in: [...phones] } },
        ],
      },
      propertyId: { not: currentPropertyId },
    },
    select: {
      property: {
        select: {
          id: true,
          streetAddress: true,
          city: true,
          state: true,
          leadStatus: true,
          propertyStatus: true,
          activeLeadStage: true,
        },
      },
      contact: { select: { phone: true, phone2: true } },
    },
    distinct: ['propertyId'],
    take: 20,
  })

  const seen = new Set<string>()
  const results: AssociatedProperty[] = []
  for (const pc of matchingContacts) {
    if (!pc.property || seen.has(pc.property.id)) continue
    seen.add(pc.property.id)
    const matchedPhone = [...phones].find(
      (p) => p === pc.contact.phone || p === pc.contact.phone2
    ) ?? ''
    results.push({ ...pc.property, matchedPhone })
  }

  return results
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/associated-properties.ts
git commit -m "feat(gap10): add getAssociatedProperties lib function"
```

---

## Task 2: `AssociatedPropertiesCard` server component

**Files:**
- Create: `apps/web/src/components/leads/AssociatedPropertiesCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
// apps/web/src/components/leads/AssociatedPropertiesCard.tsx
import Link from 'next/link'
import { Users } from 'lucide-react'
import { getAssociatedProperties } from '@/lib/associated-properties'

interface Props {
  propertyId: string
}

export async function AssociatedPropertiesCard({ propertyId }: Props) {
  const associated = await getAssociatedProperties(propertyId)

  if (associated.length === 0) return null

  function detailHref(prop: { id: string; propertyStatus: string; leadStatus: string }): string {
    const s = prop.propertyStatus
    if (s === 'IN_TM') return `/tm/${prop.id}`
    if (s === 'IN_INVENTORY') return `/inventory/${prop.id}`
    if (s === 'IN_DISPO') return `/dispo/${prop.id}`
    if (s === 'SOLD') return `/sold/${prop.id}`
    if (s === 'RENTAL') return `/rental/${prop.id}`
    // Default: active lead
    if (prop.leadStatus === 'WARM') return `/leads/warm/${prop.id}`
    if (prop.leadStatus === 'DEAD') return `/leads/dead/${prop.id}`
    return `/leads/dts/${prop.id}`
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-3.5 h-3.5 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-800">
          Associated Properties
          <span className="ml-1 text-gray-400 font-normal">({associated.length})</span>
        </h3>
      </div>

      <div className="space-y-2">
        {associated.map((prop) => (
          <div key={prop.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={detailHref(prop)}
                className="text-sm font-medium text-blue-600 hover:underline truncate block"
              >
                {[prop.streetAddress, prop.city, prop.state].filter(Boolean).join(', ') || 'Unknown address'}
              </Link>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Shared phone: {prop.matchedPhone}
              </p>
            </div>
            <span className="flex-shrink-0 text-[10px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {prop.propertyStatus?.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/leads/AssociatedPropertiesCard.tsx
git commit -m "feat(gap10): add AssociatedPropertiesCard server component"
```

---

## Task 3: Wire into all 5 detail pages

**Files:**
- Modify: `apps/web/src/app/(app)/leads/dts/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/dta/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/tm/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/inventory/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/dispo/[id]/page.tsx`

For each page:
1. Add import: `import { AssociatedPropertiesCard } from '@/components/leads/AssociatedPropertiesCard'`
2. In the overview tab right column, after the `<TagsCard>` (which was added in Gap Tags+QuickActions), add:
```tsx
<AssociatedPropertiesCard propertyId={lead.id} />
```
(or `property.id` for TM/Inventory/Dispo pages)

- [ ] **Step 1: Update DTS page**

Read `apps/web/src/app/(app)/leads/dts/[id]/page.tsx`. Add the import and the card.

- [ ] **Step 2: Update DTA page**

Read `apps/web/src/app/(app)/leads/dta/[id]/page.tsx`. Apply same changes.

- [ ] **Step 3: Update TM, Inventory, Dispo pages**

For each of `tm/[id]/page.tsx`, `inventory/[id]/page.tsx`, `dispo/[id]/page.tsx`:
- Add import
- Add `<AssociatedPropertiesCard propertyId={property.id} />` in the overview right column

- [ ] **Step 4: Commit all**

```bash
git add \
  "apps/web/src/app/(app)/leads/dts/[id]/page.tsx" \
  "apps/web/src/app/(app)/leads/dta/[id]/page.tsx" \
  "apps/web/src/app/(app)/tm/[id]/page.tsx" \
  "apps/web/src/app/(app)/inventory/[id]/page.tsx" \
  "apps/web/src/app/(app)/dispo/[id]/page.tsx"
git commit -m "feat(gap10): wire AssociatedPropertiesCard into all 5 detail pages"
```
