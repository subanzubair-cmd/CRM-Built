# Phase 8 — Lead Detail Editing + Contact Management

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all pipeline detail pages fully editable — financial/physical fields via a collapsible `PropertyEditPanel`, and full contact add/edit/remove via upgraded `ContactsCard` with modals.

**Architecture:** `PropertyEditPanel` is a client component that PATCHes the existing `/api/leads/[id]` route (extended with physical fields). All 5 pipeline detail pages (DTS, DTA, TM, Inventory, Dispo) get the panel. Contact management uses a new `lib/contacts.ts` helper + 2 new API routes (`POST /api/properties/[id]/contacts` and `PATCH/DELETE /api/properties/[id]/contacts/[contactId]`) + an upgraded `ContactsCard` that renders `AddContactModal` and `EditContactModal` inline. Tests cover the new lib helper only (3 tests). Route handlers and components follow the existing untested pattern.

**Tech Stack:** Next.js 15 App Router, Prisma 7, Zod, `lucide-react`, Vitest

---

## Actual Schema Field Names (MEMORIZE THESE)

```
Property (editable):
  exitStrategy: ExitStrategy?      askingPrice: Decimal?   offerPrice: Decimal?
  arv: Decimal?                    repairEstimate: Decimal? bedrooms: Int?
  bathrooms: Decimal?              sqft: Int?              yearBuilt: Int?
  lotSize: Decimal?                propertyType: String?   source: String?
  campaignName: String?            assignedToId: String?   tags: String[]

Contact:       id, type: ContactType, firstName, lastName?, phone?, phone2?, email?
PropertyContact: id, propertyId, contactId, role?, isPrimary: Boolean
  @@unique([propertyId, contactId])

ContactType enum: SELLER | BUYER | AGENT | VENDOR | OTHER
```

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/app/api/leads/[id]/route.ts` | MODIFY | Add physical fields to UpdateLeadSchema |
| `apps/web/src/lib/contacts.ts` | CREATE | `addContactToProperty`, `updatePropertyContact`, `removeContactFromProperty` |
| `apps/web/src/lib/__tests__/contacts.test.ts` | CREATE | 3 tests |
| `apps/web/src/app/api/properties/[id]/contacts/route.ts` | CREATE | POST — add contact to property |
| `apps/web/src/app/api/properties/[id]/contacts/[contactId]/route.ts` | CREATE | PATCH update, DELETE remove |
| `apps/web/src/components/leads/PropertyEditPanel.tsx` | CREATE | Collapsible form: financial + physical + lead info |
| `apps/web/src/components/leads/AddContactModal.tsx` | CREATE | Add contact form modal |
| `apps/web/src/components/leads/EditContactModal.tsx` | CREATE | Edit contact form modal |
| `apps/web/src/components/leads/ContactsCard.tsx` | MODIFY | Add propertyId prop, +Add button, per-contact Edit/Remove |
| `apps/web/src/app/(app)/leads/dts/[id]/page.tsx` | MODIFY | Fetch users, pass propertyId to ContactsCard, add PropertyEditPanel |
| `apps/web/src/app/(app)/leads/dta/[id]/page.tsx` | MODIFY | Same as DTS |
| `apps/web/src/app/(app)/tm/[id]/page.tsx` | MODIFY | Same pattern |
| `apps/web/src/app/(app)/inventory/[id]/page.tsx` | MODIFY | Same pattern |
| `apps/web/src/app/(app)/dispo/[id]/page.tsx` | MODIFY | Same pattern |

---

### Task 1: Extend PATCH /api/leads/[id] with Physical Property Fields

**Files:**
- Modify: `apps/web/src/app/api/leads/[id]/route.ts`

- [ ] **Step 1: Add physical fields to UpdateLeadSchema**

Read the file first. The `UpdateLeadSchema` object currently ends with `tags: z.array(z.string()).optional()`. Add these fields after `tags`:

```typescript
  bedrooms: z.number().int().nullable().optional(),
  bathrooms: z.number().nullable().optional(),
  sqft: z.number().int().nullable().optional(),
  yearBuilt: z.number().int().nullable().optional(),
  lotSize: z.number().nullable().optional(),
  propertyType: z.string().max(100).nullable().optional(),
  campaignName: z.string().max(255).nullable().optional(),
```

The `updates` object spread on line `const updates: Record<string, unknown> = { ...data }` will automatically include these new fields since they are top-level in `data`. No other changes needed — the Prisma update call already uses spread.

- [ ] **Step 2: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/app/api/leads && git commit -m "feat: extend PATCH leads route with physical property fields"
```

---

### Task 2: Contacts Lib Helper + Tests (TDD)

**Files:**
- Create: `apps/web/src/lib/__tests__/contacts.test.ts`
- Create: `apps/web/src/lib/contacts.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/lib/__tests__/contacts.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    contact: { create: vi.fn(), update: vi.fn() },
    propertyContact: {
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { addContactToProperty, removeContactFromProperty } from '../contacts'

describe('addContactToProperty', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates contact and link without unsetting primary when isPrimary=false', async () => {
    vi.mocked(prisma.contact.create).mockResolvedValue({
      id: 'c1', firstName: 'John', lastName: 'Smith', type: 'SELLER',
    } as any)
    vi.mocked(prisma.propertyContact.create).mockResolvedValue({
      id: 'pc1', propertyId: 'p1', contactId: 'c1', isPrimary: false,
    } as any)

    const result = await addContactToProperty('p1', { firstName: 'John', isPrimary: false })

    expect(prisma.contact.create).toHaveBeenCalledOnce()
    expect(prisma.propertyContact.updateMany).not.toHaveBeenCalled()
    expect(result.contact.id).toBe('c1')
  })

  it('unsets other primary contacts when isPrimary=true', async () => {
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c2', firstName: 'Jane', type: 'SELLER' } as any)
    vi.mocked(prisma.propertyContact.create).mockResolvedValue({ id: 'pc2' } as any)
    vi.mocked(prisma.propertyContact.updateMany).mockResolvedValue({ count: 1 } as any)

    await addContactToProperty('p1', { firstName: 'Jane', isPrimary: true })

    expect(prisma.propertyContact.updateMany).toHaveBeenCalledWith({
      where: { propertyId: 'p1', isPrimary: true },
      data: { isPrimary: false },
    })
  })
})

describe('removeContactFromProperty', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the property-contact link by propertyId and contactId', async () => {
    vi.mocked(prisma.propertyContact.deleteMany).mockResolvedValue({ count: 1 } as any)

    await removeContactFromProperty('p1', 'c1')

    expect(prisma.propertyContact.deleteMany).toHaveBeenCalledWith({
      where: { propertyId: 'p1', contactId: 'c1' },
    })
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run src/lib/__tests__/contacts.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../contacts'`

- [ ] **Step 3: Create `apps/web/src/lib/contacts.ts`**

```typescript
import { prisma } from '@/lib/prisma'

export interface AddContactInput {
  firstName: string
  lastName?: string | null
  phone?: string | null
  email?: string | null
  contactType?: 'SELLER' | 'BUYER' | 'AGENT' | 'VENDOR' | 'OTHER'
  role?: string | null
  isPrimary?: boolean
}

export interface UpdateContactInput {
  firstName?: string
  lastName?: string | null
  phone?: string | null
  email?: string | null
  role?: string | null
  isPrimary?: boolean
}

export async function addContactToProperty(
  propertyId: string,
  data: AddContactInput
) {
  const { firstName, lastName, phone, email, contactType = 'SELLER', role, isPrimary = false } = data

  if (isPrimary) {
    await prisma.propertyContact.updateMany({
      where: { propertyId, isPrimary: true },
      data: { isPrimary: false },
    })
  }

  const contact = await prisma.contact.create({
    data: {
      firstName,
      ...(lastName != null && { lastName }),
      ...(phone != null && { phone }),
      ...(email != null && { email }),
      type: contactType as any,
    },
  })

  const propertyContact = await prisma.propertyContact.create({
    data: {
      propertyId,
      contactId: contact.id,
      ...(role != null && { role }),
      isPrimary,
    },
  })

  return { contact, propertyContact }
}

export async function updatePropertyContact(
  propertyId: string,
  contactId: string,
  data: UpdateContactInput
) {
  if (data.isPrimary) {
    await prisma.propertyContact.updateMany({
      where: { propertyId, isPrimary: true, contactId: { not: contactId } },
      data: { isPrimary: false },
    })
  }

  const contactUpdates: Record<string, unknown> = {}
  if (data.firstName !== undefined) contactUpdates.firstName = data.firstName
  if (data.lastName !== undefined) contactUpdates.lastName = data.lastName
  if (data.phone !== undefined) contactUpdates.phone = data.phone
  if (data.email !== undefined) contactUpdates.email = data.email

  const pcUpdates: Record<string, unknown> = {}
  if (data.role !== undefined) pcUpdates.role = data.role
  if (data.isPrimary !== undefined) pcUpdates.isPrimary = data.isPrimary

  await Promise.all([
    Object.keys(contactUpdates).length > 0
      ? prisma.contact.update({ where: { id: contactId }, data: contactUpdates })
      : Promise.resolve(),
    Object.keys(pcUpdates).length > 0
      ? prisma.propertyContact.updateMany({ where: { propertyId, contactId }, data: pcUpdates })
      : Promise.resolve(),
  ])
}

export async function removeContactFromProperty(
  propertyId: string,
  contactId: string
) {
  await prisma.propertyContact.deleteMany({
    where: { propertyId, contactId },
  })
}
```

- [ ] **Step 4: Run to confirm 3 tests pass**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run src/lib/__tests__/contacts.test.ts 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/lib/contacts.ts apps/web/src/lib/__tests__/contacts.test.ts && git commit -m "feat: add contacts lib helper (add/update/remove contact on property)"
```

---

### Task 3: Contact Management API Routes

**Files:**
- Create: `apps/web/src/app/api/properties/[id]/contacts/route.ts`
- Create: `apps/web/src/app/api/properties/[id]/contacts/[contactId]/route.ts`

- [ ] **Step 1: Create POST /api/properties/[id]/contacts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { addContactToProperty } from '@/lib/contacts'

const AddContactSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  contactType: z.enum(['SELLER', 'BUYER', 'AGENT', 'VENDOR', 'OTHER']).default('SELLER'),
  role: z.string().max(50).nullable().optional(),
  isPrimary: z.boolean().default(false),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = AddContactSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const result = await addContactToProperty(id, parsed.data)
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err) {
    console.error('[contacts] add error:', err)
    return NextResponse.json({ error: 'Failed to add contact' }, { status: 500 })
  }
}
```

Save to: `apps/web/src/app/api/properties/[id]/contacts/route.ts`

- [ ] **Step 2: Create PATCH + DELETE /api/properties/[id]/contacts/[contactId]**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { updatePropertyContact, removeContactFromProperty } from '@/lib/contacts'

const UpdateContactSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  role: z.string().max(50).nullable().optional(),
  isPrimary: z.boolean().optional(),
})

type Params = { params: Promise<{ id: string; contactId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, contactId } = await params
  const body = await req.json()
  const parsed = UpdateContactSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    await updatePropertyContact(id, contactId, parsed.data)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[contacts] update error:', err)
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, contactId } = await params

  try {
    await removeContactFromProperty(id, contactId)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[contacts] remove error:', err)
    return NextResponse.json({ error: 'Failed to remove contact' }, { status: 500 })
  }
}
```

Save to: `apps/web/src/app/api/properties/[id]/contacts/[contactId]/route.ts`

- [ ] **Step 3: TypeScript check + commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: Zero errors.

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/app/api/properties && git commit -m "feat: add contact management API routes (POST/PATCH/DELETE)"
```

---

### Task 4: PropertyEditPanel Component

**Files:**
- Create: `apps/web/src/components/leads/PropertyEditPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, Check, Loader2 } from 'lucide-react'

const EXIT_STRATEGIES = [
  { value: '', label: '— not set —' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'SELLER_FINANCE', label: 'Seller Finance' },
  { value: 'INSTALLMENT', label: 'Installment' },
  { value: 'FIX_AND_FLIP', label: 'Fix & Flip' },
  { value: 'INVENTORY_LATER', label: 'Inventory Later' },
  { value: 'RENTAL', label: 'Rental' },
  { value: 'TURNKEY', label: 'Turnkey' },
]

interface EditValues {
  exitStrategy: string | null
  askingPrice: number | null
  offerPrice: number | null
  arv: number | null
  repairEstimate: number | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  yearBuilt: number | null
  lotSize: number | null
  propertyType: string | null
  source: string | null
  campaignName: string | null
  assignedToId: string | null
  tags: string[]
}

interface Props {
  propertyId: string
  initialValues: EditValues
  users: { id: string; name: string }[]
}

const inputCls =
  'w-full mt-0.5 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

export function PropertyEditPanel({ propertyId, initialValues, users }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [values, setValues] = useState({
    exitStrategy: initialValues.exitStrategy ?? '',
    askingPrice: initialValues.askingPrice?.toString() ?? '',
    offerPrice: initialValues.offerPrice?.toString() ?? '',
    arv: initialValues.arv?.toString() ?? '',
    repairEstimate: initialValues.repairEstimate?.toString() ?? '',
    bedrooms: initialValues.bedrooms?.toString() ?? '',
    bathrooms: initialValues.bathrooms?.toString() ?? '',
    sqft: initialValues.sqft?.toString() ?? '',
    yearBuilt: initialValues.yearBuilt?.toString() ?? '',
    lotSize: initialValues.lotSize?.toString() ?? '',
    propertyType: initialValues.propertyType ?? '',
    source: initialValues.source ?? '',
    campaignName: initialValues.campaignName ?? '',
    assignedToId: initialValues.assignedToId ?? '',
    tags: initialValues.tags.join(', '),
  })

  function set(key: keyof typeof values, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        exitStrategy: values.exitStrategy || null,
        askingPrice: values.askingPrice ? parseFloat(values.askingPrice) : null,
        offerPrice: values.offerPrice ? parseFloat(values.offerPrice) : null,
        arv: values.arv ? parseFloat(values.arv) : null,
        repairEstimate: values.repairEstimate ? parseFloat(values.repairEstimate) : null,
        bedrooms: values.bedrooms ? parseInt(values.bedrooms, 10) : null,
        bathrooms: values.bathrooms ? parseFloat(values.bathrooms) : null,
        sqft: values.sqft ? parseInt(values.sqft, 10) : null,
        yearBuilt: values.yearBuilt ? parseInt(values.yearBuilt, 10) : null,
        lotSize: values.lotSize ? parseFloat(values.lotSize) : null,
        propertyType: values.propertyType || null,
        source: values.source || null,
        campaignName: values.campaignName || null,
        assignedToId: values.assignedToId || null,
        tags: values.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }

      const res = await fetch(`/api/leads/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save')
      setOpen(false)
      router.refresh()
    } catch {
      setError('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-gray-400" />
          Edit Property Details
        </span>
        <span className="text-[11px] text-gray-400">Click to expand ›</span>
      </button>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-gray-500" />
          <span className="text-[13px] font-semibold text-gray-800">Edit Property Details</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4 text-sm">
        {/* Financial */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Financial
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['askingPrice', 'Asking Price'],
                ['offerPrice', 'Offer Price'],
                ['arv', 'ARV'],
                ['repairEstimate', 'Repair Est.'],
              ] as [keyof typeof values, string][]
            ).map(([key, label]) => (
              <div key={key}>
                <label className="text-[11px] text-gray-500">{label}</label>
                <input
                  type="number"
                  placeholder="0"
                  className={inputCls}
                  value={values[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Exit Strategy */}
        <div>
          <label className="text-[11px] text-gray-500">Exit Strategy</label>
          <select
            className={inputCls}
            value={values.exitStrategy}
            onChange={(e) => set('exitStrategy', e.target.value)}
          >
            {EXIT_STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Property Details */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Property
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['bedrooms', 'Beds', '1'],
                ['bathrooms', 'Baths', '0.5'],
                ['sqft', 'Sq Ft', '1'],
                ['yearBuilt', 'Year Built', '1'],
              ] as [keyof typeof values, string, string][]
            ).map(([key, label, step]) => (
              <div key={key}>
                <label className="text-[11px] text-gray-500">{label}</label>
                <input
                  type="number"
                  step={step}
                  placeholder="—"
                  className={inputCls}
                  value={values[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="mt-2">
            <label className="text-[11px] text-gray-500">Property Type</label>
            <input
              type="text"
              placeholder="e.g. Single Family"
              className={inputCls}
              value={values.propertyType}
              onChange={(e) => set('propertyType', e.target.value)}
            />
          </div>
        </div>

        {/* Lead Info */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Lead Info
          </p>
          <div className="space-y-2">
            <div>
              <label className="text-[11px] text-gray-500">Source</label>
              <input
                type="text"
                placeholder="e.g. Cold Call, Direct Mail"
                className={inputCls}
                value={values.source}
                onChange={(e) => set('source', e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Campaign</label>
              <input
                type="text"
                placeholder="Campaign name"
                className={inputCls}
                value={values.campaignName}
                onChange={(e) => set('campaignName', e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Assigned To</label>
              <select
                className={inputCls}
                value={values.assignedToId}
                onChange={(e) => set('assignedToId', e.target.value)}
              >
                <option value="">— unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Tags (comma-separated)</label>
              <input
                type="text"
                placeholder="tag1, tag2"
                className={inputCls}
                value={values.tags}
                onChange={(e) => set('tags', e.target.value)}
              />
            </div>
          </div>
        </div>

        {error && <p className="text-[11px] text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/components/leads/PropertyEditPanel.tsx && git commit -m "feat: add PropertyEditPanel collapsible edit form component"
```

---

### Task 5: Wire PropertyEditPanel into All 5 Detail Pages

**Files:**
- Modify: `apps/web/src/app/(app)/leads/dts/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/dta/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/tm/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/inventory/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/dispo/[id]/page.tsx`

The pattern is identical for all 5 pages. Do them one at a time.

**For each page:**

1. Add `import { prisma } from '@/lib/prisma'` if not already present
2. Add `import { PropertyEditPanel } from '@/components/leads/PropertyEditPanel'`
3. Wrap the existing single-fetch in `Promise.all` with a users query
4. Add `<PropertyEditPanel>` at the bottom of the right column `<div className="space-y-4">`

- [ ] **Step 1: Modify `apps/web/src/app/(app)/leads/dts/[id]/page.tsx`**

Read the file first. Current fetch:
```typescript
const lead = await getLeadById(id)
```

Replace with:
```typescript
const [lead, users] = await Promise.all([
  getLeadById(id),
  prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  }),
])
```

Add import `import { prisma } from '@/lib/prisma'` and `import { PropertyEditPanel } from '@/components/leads/PropertyEditPanel'` to the top of the file (after existing imports).

Add at the end of the right column `<div className="space-y-4">`, after the closing `</div>` of the Property Details card:
```tsx
<PropertyEditPanel
  propertyId={lead.id}
  initialValues={{
    exitStrategy: lead.exitStrategy ?? null,
    askingPrice: lead.askingPrice ? Number(lead.askingPrice) : null,
    offerPrice: lead.offerPrice ? Number(lead.offerPrice) : null,
    arv: lead.arv ? Number(lead.arv) : null,
    repairEstimate: lead.repairEstimate ? Number(lead.repairEstimate) : null,
    bedrooms: lead.bedrooms ?? null,
    bathrooms: lead.bathrooms ? Number(lead.bathrooms) : null,
    sqft: lead.sqft ?? null,
    yearBuilt: lead.yearBuilt ?? null,
    lotSize: lead.lotSize ? Number(lead.lotSize) : null,
    propertyType: lead.propertyType ?? null,
    source: lead.source ?? null,
    campaignName: lead.campaignName ?? null,
    assignedToId: lead.assignedToId ?? null,
    tags: lead.tags,
  }}
  users={users}
/>
```

- [ ] **Step 2: Modify `apps/web/src/app/(app)/leads/dta/[id]/page.tsx`**

Apply the same changes as Step 1 — identical structure. Replace single `getLeadById(id)` call with `Promise.all`, add imports, add `PropertyEditPanel` at bottom of right column.

- [ ] **Step 3: Modify `apps/web/src/app/(app)/tm/[id]/page.tsx`**

Read the file first. Current fetch uses `getPropertyById(id)` (not `getLeadById`). The variable is `property` not `lead`.

Replace:
```typescript
const property = await getPropertyById(id)
```

With:
```typescript
const [property, users] = await Promise.all([
  getPropertyById(id),
  prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  }),
])
```

Add imports and add `PropertyEditPanel` (using `property` instead of `lead` for the prop values) at bottom of right column:
```tsx
<PropertyEditPanel
  propertyId={property.id}
  initialValues={{
    exitStrategy: property.exitStrategy ?? null,
    askingPrice: property.askingPrice ? Number(property.askingPrice) : null,
    offerPrice: property.offerPrice ? Number(property.offerPrice) : null,
    arv: property.arv ? Number(property.arv) : null,
    repairEstimate: property.repairEstimate ? Number(property.repairEstimate) : null,
    bedrooms: property.bedrooms ?? null,
    bathrooms: property.bathrooms ? Number(property.bathrooms) : null,
    sqft: property.sqft ?? null,
    yearBuilt: property.yearBuilt ?? null,
    lotSize: property.lotSize ? Number(property.lotSize) : null,
    propertyType: property.propertyType ?? null,
    source: property.source ?? null,
    campaignName: property.campaignName ?? null,
    assignedToId: property.assignedToId ?? null,
    tags: property.tags,
  }}
  users={users}
/>
```

- [ ] **Step 4: Modify `apps/web/src/app/(app)/inventory/[id]/page.tsx`**

Apply the same pattern as Step 3 (uses `property` variable, `getPropertyById`).

- [ ] **Step 5: Modify `apps/web/src/app/(app)/dispo/[id]/page.tsx`**

Apply the same pattern as Steps 3–4.

- [ ] **Step 6: TypeScript check + commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: Zero errors. If you see `Property 'prisma' not found on type` in a page file, add `import { prisma } from '@/lib/prisma'` to that file.

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add "apps/web/src/app/(app)" && git commit -m "feat: wire PropertyEditPanel into DTS, DTA, TM, Inventory, and Dispo detail pages"
```

---

### Task 6: Contact Management Modals + Upgrade ContactsCard

**Files:**
- Create: `apps/web/src/components/leads/AddContactModal.tsx`
- Create: `apps/web/src/components/leads/EditContactModal.tsx`
- Modify: `apps/web/src/components/leads/ContactsCard.tsx`

- [ ] **Step 1: Create `apps/web/src/components/leads/AddContactModal.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

const CONTACT_TYPES = [
  { value: 'SELLER', label: 'Seller' },
  { value: 'BUYER', label: 'Buyer' },
  { value: 'AGENT', label: 'Agent' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'OTHER', label: 'Other' },
]

const inputCls =
  'w-full mt-0.5 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

interface Props {
  propertyId: string
  onClose: () => void
  onAdded: () => void
}

export function AddContactModal({ propertyId, onClose, onAdded }: Props) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [contactType, setContactType] = useState('SELLER')
  const [role, setRole] = useState('')
  const [isPrimary, setIsPrimary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim()) { setError('First name is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/properties/${propertyId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          contactType,
          role: role.trim() || null,
          isPrimary,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      onAdded()
    } catch {
      setError('Failed to add contact. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Add Contact</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">First Name *</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Last Name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">Type</label>
              <select value={contactType} onChange={(e) => setContactType(e.target.value)} className={inputCls}>
                {CONTACT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Role</label>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Owner"
                className={inputCls}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="rounded border-gray-300"
            />
            Set as primary contact
          </label>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Adding…' : 'Add Contact'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `apps/web/src/components/leads/EditContactModal.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

const CONTACT_TYPES = [
  { value: 'SELLER', label: 'Seller' },
  { value: 'BUYER', label: 'Buyer' },
  { value: 'AGENT', label: 'Agent' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'OTHER', label: 'Other' },
]

const inputCls =
  'w-full mt-0.5 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

interface ContactData {
  contactId: string
  firstName: string
  lastName: string | null
  phone: string | null
  email: string | null
  contactType: string
  role: string | null
  isPrimary: boolean
}

interface Props {
  propertyId: string
  contact: ContactData
  onClose: () => void
  onSaved: () => void
}

export function EditContactModal({ propertyId, contact, onClose, onSaved }: Props) {
  const [firstName, setFirstName] = useState(contact.firstName)
  const [lastName, setLastName] = useState(contact.lastName ?? '')
  const [phone, setPhone] = useState(contact.phone ?? '')
  const [email, setEmail] = useState(contact.email ?? '')
  const [contactType, setContactType] = useState(contact.contactType)
  const [role, setRole] = useState(contact.role ?? '')
  const [isPrimary, setIsPrimary] = useState(contact.isPrimary)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim()) { setError('First name is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(
        `/api/properties/${propertyId}/contacts/${contact.contactId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim() || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            role: role.trim() || null,
            isPrimary,
          }),
        }
      )
      if (!res.ok) throw new Error('Failed')
      onSaved()
    } catch {
      setError('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Edit Contact</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">First Name *</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} autoFocus />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Last Name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">Type</label>
              <select value={contactType} onChange={(e) => setContactType(e.target.value)} className={inputCls}>
                {CONTACT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Role</label>
              <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Owner" className={inputCls} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="rounded border-gray-300"
            />
            Set as primary contact
          </label>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Modify `apps/web/src/components/leads/ContactsCard.tsx`**

Read the file first. Replace the entire file with this upgraded version that adds `propertyId`, +Add button, and per-contact Edit/Remove:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Mail, Pencil, Trash2, UserPlus } from 'lucide-react'
import { AddContactModal } from './AddContactModal'
import { EditContactModal } from './EditContactModal'

interface PropertyContact {
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
  propertyId: string
  contacts: PropertyContact[]
}

export function ContactsCard({ propertyId, contacts }: Props) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [editingContact, setEditingContact] = useState<PropertyContact | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleRemove(contactId: string) {
    if (!confirm('Remove this contact from the property?')) return
    setRemovingId(contactId)
    try {
      await fetch(`/api/properties/${propertyId}/contacts/${contactId}`, {
        method: 'DELETE',
      })
      router.refresh()
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">
          Contacts <span className="text-gray-400 font-normal">({contacts.length})</span>
        </h3>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-gray-400">No contacts — add one above.</p>
      ) : (
        <div className="space-y-3">
          {contacts.map((pc) => (
            <div key={pc.id} className="flex items-start gap-3 group">
              <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-blue-700">
                  {pc.contact.firstName[0]}
                  {pc.contact.lastName?.[0] ?? ''}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-900">
                    {pc.contact.firstName} {pc.contact.lastName}
                  </p>
                  {pc.isPrimary && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
                      Primary
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">{pc.role ?? pc.contact.type}</p>
                <div className="flex items-center gap-3 mt-1">
                  {pc.contact.phone && (
                    <a
                      href={`tel:${pc.contact.phone}`}
                      className="flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600"
                    >
                      <Phone className="w-3 h-3" />
                      {pc.contact.phone}
                    </a>
                  )}
                  {pc.contact.email && (
                    <a
                      href={`mailto:${pc.contact.email}`}
                      className="flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600"
                    >
                      <Mail className="w-3 h-3" />
                      {pc.contact.email}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => setEditingContact(pc)}
                  className="p-1 text-gray-400 hover:text-blue-600 rounded"
                  title="Edit contact"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleRemove(pc.contact.id)}
                  disabled={removingId === pc.contact.id}
                  className="p-1 text-gray-400 hover:text-red-600 rounded disabled:opacity-40"
                  title="Remove contact"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddContactModal
          propertyId={propertyId}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); router.refresh() }}
        />
      )}

      {editingContact && (
        <EditContactModal
          propertyId={propertyId}
          contact={{
            contactId: editingContact.contact.id,
            firstName: editingContact.contact.firstName,
            lastName: editingContact.contact.lastName,
            phone: editingContact.contact.phone,
            email: editingContact.contact.email,
            contactType: editingContact.contact.type,
            role: editingContact.role,
            isPrimary: editingContact.isPrimary,
          }}
          onClose={() => setEditingContact(null)}
          onSaved={() => { setEditingContact(null); router.refresh() }}
        />
      )}
    </div>
  )
}
```

Important: All places that use `<ContactsCard contacts={...} />` now need `propertyId={...}` added. The detail pages for DTS, DTA, TM, Inventory, and Dispo all use ContactsCard. After updating the component interface, TypeScript will error on the missing prop — use that to find every callsite.

- [ ] **Step 4: Update all ContactsCard callsites to add propertyId**

Search for `<ContactsCard` in the app and add `propertyId={lead.id}` or `propertyId={property.id}` to each callsite.

Run:
```bash
grep -r "<ContactsCard" "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web/src" --include="*.tsx" -l 2>&1
```

For each file found, add `propertyId={lead.id}` or `propertyId={property.id}` (whichever variable the page uses) to the `<ContactsCard ...>` call.

The expected files: `leads/dts/[id]/page.tsx`, `leads/dta/[id]/page.tsx`, `tm/[id]/page.tsx`, `inventory/[id]/page.tsx`, `dispo/[id]/page.tsx`.

- [ ] **Step 5: TypeScript check + commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: Zero errors.

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/components/leads && git commit -m "feat: add contact management UI — AddContactModal, EditContactModal, upgraded ContactsCard"
```

---

### Task 7: Build Verification

**Files:** No new files — verification only.

- [ ] **Step 1: Run all tests**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run 2>&1 | tail -15
```

Expected: **59 tests passing** (56 from Phases 1–7 + 3 new contacts tests). Zero failures.

Common fixes if contacts tests fail:
- `Cannot find module '../contacts'` → the lib file path or export name is wrong
- `prisma.propertyContact is not a mock` → the mock in the test file is missing `propertyContact`

- [ ] **Step 2: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: Zero errors.

Common fixes:
- `propertyId` missing on `<ContactsCard>` → check the callsite fix in Task 6, Step 4
- `Type 'Decimal' is not assignable to 'number'` → wrap with `Number(value)` at the callsite

- [ ] **Step 3: Production build**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd next build 2>&1 | tail -30
```

Expected: Build succeeds. All pipeline detail routes (`/leads/dts/[id]`, `/leads/dta/[id]`, `/tm/[id]`, `/inventory/[id]`, `/dispo/[id]`) show `ƒ (Dynamic)`.

- [ ] **Step 4: Final commit log check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git log --oneline -8
```

Expected (8 Phase 8 commits):
```
feat: add contact management UI — AddContactModal, EditContactModal, upgraded ContactsCard
feat: wire PropertyEditPanel into DTS, DTA, TM, Inventory, and Dispo detail pages
feat: add PropertyEditPanel collapsible edit form component
feat: add contact management API routes (POST/PATCH/DELETE)
feat: add contacts lib helper (add/update/remove contact on property)
feat: extend PATCH leads route with physical property fields
```
