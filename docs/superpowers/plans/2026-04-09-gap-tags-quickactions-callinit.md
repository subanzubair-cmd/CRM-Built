# Tags, Quick Action Bar & Call Initiation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tag chip management, a sticky quick-action bar (Call / SMS / Email), and a call initiation + outcome logging flow to all 5 active property detail pages, matching REsimpli's lead detail UX.

**Architecture:** Tags are stored as `Property.tags String[]` and already editable via `PATCH /api/leads/[id]`. This plan adds a dedicated `TagsCard` chip UI and tag activity logging. The quick-action bar is a client component rendered below the existing header. Call initiation opens a modal that POSTs to the existing `POST /api/calls` endpoint; a follow-up `CallOutcomeModal` logs the disposition via the existing `POST /api/messages` endpoint. A new `GET /api/twilio-numbers` route feeds the outbound number picker.

**Tech Stack:** Next.js 15 App Router, Prisma (PostgreSQL), plain HTML + Tailwind CSS (no shadcn/ui), lucide-react icons, existing `POST /api/calls`, `POST /api/messages`, `PATCH /api/leads/[id]`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/app/api/twilio-numbers/route.ts` | Create | GET — list active TwilioNumbers for the outbound number picker |
| `apps/web/src/components/leads/TagsCard.tsx` | Create | Display tags as chips; add/remove via PATCH /api/leads/:id |
| `apps/web/src/app/api/leads/[id]/route.ts` | Modify | Detect tag changes and write TAG_ADDED/TAG_REMOVED activity logs |
| `apps/web/src/components/leads/ActivityCard.tsx` | Modify | Add TAG_ADDED, TAG_REMOVED, MESSAGE_LOGGED to ACTION_LABELS map |
| `apps/web/src/components/leads/InitiateCallModal.tsx` | Create | Modal: pick outbound number → POST /api/calls → show "calling" state |
| `apps/web/src/components/leads/CallOutcomeModal.tsx` | Create | Modal: pick disposition → POST /api/messages (CALL/OUTBOUND) |
| `apps/web/src/components/leads/QuickActionBar.tsx` | Create | Call / SMS / Email sticky button row; opens InitiateCallModal for Call |
| `apps/web/src/app/(app)/leads/dts/[id]/page.tsx` | Modify | Wire TagsCard into overview tab; add QuickActionBar to sticky header |
| `apps/web/src/app/(app)/leads/dta/[id]/page.tsx` | Modify | Same as DTS |
| `apps/web/src/app/(app)/tm/[id]/page.tsx` | Modify | Same pattern |
| `apps/web/src/app/(app)/inventory/[id]/page.tsx` | Modify | Same pattern |
| `apps/web/src/app/(app)/dispo/[id]/page.tsx` | Modify | Same pattern |

---

## Task 1: GET /api/twilio-numbers route

**Files:**
- Create: `apps/web/src/app/api/twilio-numbers/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// apps/web/src/app/api/twilio-numbers/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/twilio-numbers
 * Returns all active Twilio numbers for the outbound number picker in the call modal.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const numbers = await prisma.twilioNumber.findMany({
    where: { isActive: true },
    select: { id: true, number: true, friendlyName: true, marketId: true },
    orderBy: { friendlyName: 'asc' },
  })

  return NextResponse.json({ data: numbers })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/twilio-numbers/route.ts
git commit -m "feat(gap-tags): add GET /api/twilio-numbers route"
```

---

## Task 2: TagsCard component

**Files:**
- Create: `apps/web/src/components/leads/TagsCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
// apps/web/src/components/leads/TagsCard.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tag, X, Plus } from 'lucide-react'

interface Props {
  propertyId: string
  initialTags: string[]
}

export function TagsCard({ propertyId, initialTags }: Props) {
  const router = useRouter()
  const [tags, setTags] = useState<string[]>(initialTags)
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function saveTags(newTags: string[]) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
      })
      if (!res.ok) throw new Error('Failed to save tags')
      setTags(newTags)
      startTransition(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving tags')
    } finally {
      setSaving(false)
    }
  }

  async function addTag() {
    const tag = input.trim().toLowerCase().replace(/\s+/g, '-')
    if (!tag) { setAdding(false); setInput(''); return }
    if (tags.includes(tag)) { setInput(''); setAdding(false); return }
    await saveTags([...tags, tag])
    setInput('')
    setAdding(false)
  }

  async function removeTag(tag: string) {
    await saveTags(tags.filter((t) => t !== tag))
  }

  // Hide internal list-stacking tags from the chip UI
  const displayTags = tags.filter((t) => !t.startsWith('list:'))
  const internalCount = tags.length - displayTags.length

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-800">
            Tags
            {displayTags.length > 0 && (
              <span className="ml-1 text-gray-400 font-normal">({displayTags.length})</span>
            )}
          </h3>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Tag
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 mb-2">{error}</p>
      )}

      <div className="flex flex-wrap gap-1.5 min-h-[24px]">
        {displayTags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-0.5 rounded-full"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              disabled={saving}
              className="text-blue-400 hover:text-blue-700 disabled:opacity-40 ml-0.5"
              title={`Remove "${tag}"`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        {displayTags.length === 0 && !adding && (
          <p className="text-xs text-gray-400">No tags yet</p>
        )}
      </div>

      {adding && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTag()
              if (e.key === 'Escape') { setAdding(false); setInput('') }
            }}
            placeholder="Tag name…"
            className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={addTag}
            disabled={saving || !input.trim()}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-50"
          >
            {saving ? '…' : 'Add'}
          </button>
          <button
            onClick={() => { setAdding(false); setInput('') }}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      )}

      {internalCount > 0 && (
        <p className="text-[10px] text-gray-300 mt-2">
          + {internalCount} internal list-stacking tag{internalCount !== 1 ? 's' : ''} (hidden)
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/leads/TagsCard.tsx
git commit -m "feat(gap-tags): add TagsCard chip UI component"
```

---

## Task 3: Tag activity logging + ActivityCard labels

**Files:**
- Modify: `apps/web/src/app/api/leads/[id]/route.ts` (lines 47–52 — the `existing` select, and lines 62–79 — the activity entries block)
- Modify: `apps/web/src/components/leads/ActivityCard.tsx` (lines 1–16 — ACTION_LABELS)

- [ ] **Step 1: Update `existing` select to include `tags`**

In `apps/web/src/app/api/leads/[id]/route.ts`, find this block (around line 47):

```typescript
  const existing = await prisma.property.findUnique({
    where: { id },
    select: { activeLeadStage: true, leadStatus: true, propertyStatus: true, tmStage: true, inventoryStage: true },
  })
```

Replace with:

```typescript
  const existing = await prisma.property.findUnique({
    where: { id },
    select: { activeLeadStage: true, leadStatus: true, propertyStatus: true, tmStage: true, inventoryStage: true, tags: true },
  })
```

- [ ] **Step 2: Add tag diff activity entries**

In the same file, find the section that builds `activityEntries` (after `const activityEntries: Array<...> = []`). After the existing `if (data.inventoryStage ...)` block (around line 78), add:

```typescript
  if (data.tags !== undefined && existing) {
    const added = data.tags.filter((t) => !existing.tags.includes(t))
    const removed = existing.tags.filter((t) => !data.tags!.includes(t))
    if (added.length > 0) {
      activityEntries.push({ action: 'TAG_ADDED', detail: `Tags added: ${added.join(', ')}` })
    }
    if (removed.length > 0) {
      activityEntries.push({ action: 'TAG_REMOVED', detail: `Tags removed: ${removed.join(', ')}` })
    }
  }
```

- [ ] **Step 3: Add labels to ActivityCard**

In `apps/web/src/components/leads/ActivityCard.tsx`, find `ACTION_LABELS` (lines 3–16). Add the missing keys:

```typescript
const ACTION_LABELS: Record<string, string> = {
  LEAD_CREATED: 'Lead Created',
  STAGE_CHANGED: 'Stage Changed',
  STAGE_CHANGE: 'Stage Changed',
  STATUS_CHANGED: 'Status Changed',
  STATUS_CHANGE: 'Status Changed',
  PIPELINE_CHANGE: 'Pipeline Changed',
  NOTE_ADDED: 'Note Added',
  TASK_CREATED: 'Task Created',
  TASK_COMPLETED: 'Task Completed',
  AI_SUMMARY_GENERATED: 'AI Summary Generated',
  HOT_LEAD_SCORED: 'Hot Lead Scored',
  CONTACT_ADDED: 'Contact Added',
  CONTACT_REMOVED: 'Contact Removed',
  PROPERTY_PROMOTED: 'Property Promoted',
  OFFER_RECEIVED: 'Offer Received',
  TAG_ADDED: 'Tag Added',
  TAG_REMOVED: 'Tag Removed',
  MESSAGE_LOGGED: 'Communication Logged',
  LEAD_DELETED: 'Lead Deleted',
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/leads/[id]/route.ts apps/web/src/components/leads/ActivityCard.tsx
git commit -m "feat(gap-tags): add tag activity logging and ActivityCard labels"
```

---

## Task 4: InitiateCallModal + CallOutcomeModal

**Files:**
- Create: `apps/web/src/components/leads/InitiateCallModal.tsx`
- Create: `apps/web/src/components/leads/CallOutcomeModal.tsx`

- [ ] **Step 1: Create `CallOutcomeModal.tsx`**

```typescript
// apps/web/src/components/leads/CallOutcomeModal.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, X } from 'lucide-react'

const DISPOSITIONS = [
  { value: 'voicemail', label: 'Voicemail Left' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'connected_interested', label: 'Connected — Interested' },
  { value: 'connected_not_interested', label: 'Connected — Not Interested' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'callback_requested', label: 'Callback Requested' },
]

interface Props {
  propertyId: string
  callId: string | null
  callStartedAt: Date
  onClose: () => void
}

export function CallOutcomeModal({ propertyId, callId, callStartedAt, onClose }: Props) {
  const router = useRouter()
  const [disposition, setDisposition] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const durationSecs = Math.floor((Date.now() - callStartedAt.getTime()) / 1000)
  const durationLabel = durationSecs < 60
    ? `${durationSecs}s`
    : `${Math.floor(durationSecs / 60)}m ${durationSecs % 60}s`

  async function logOutcome() {
    if (!disposition) return
    setSaving(true)
    setError(null)
    const label = DISPOSITIONS.find((d) => d.value === disposition)?.label ?? disposition
    const body = [label, notes.trim()].filter(Boolean).join(' — ')
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          channel: 'CALL',
          direction: 'OUTBOUND',
          body: `${body} (${durationLabel})`,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Failed to log outcome')
      }
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error logging outcome')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-sm text-gray-900">Log Call Outcome</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-400">Duration: {durationLabel}</p>

          <div className="grid grid-cols-2 gap-1.5">
            {DISPOSITIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDisposition(d.value)}
                className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors text-left ${
                  disposition === d.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes (optional)…"
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-xl hover:bg-gray-50"
          >
            Skip
          </button>
          <button
            onClick={logOutcome}
            disabled={!disposition || saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Log Outcome'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `InitiateCallModal.tsx`**

```typescript
// apps/web/src/components/leads/InitiateCallModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { Phone, X } from 'lucide-react'
import { CallOutcomeModal } from './CallOutcomeModal'

interface TwilioNumber {
  id: string
  number: string
  friendlyName: string | null
}

interface Props {
  propertyId: string
  contactPhone: string | null
  propertyAddress: string
  onClose: () => void
}

type Step = 'configure' | 'calling' | 'outcome'

export function InitiateCallModal({ propertyId, contactPhone, propertyAddress, onClose }: Props) {
  const [step, setStep] = useState<Step>('configure')
  const [twilioNumbers, setTwilioNumbers] = useState<TwilioNumber[]>([])
  const [fromNumber, setFromNumber] = useState('')
  const [callId, setCallId] = useState<string | null>(null)
  const [callStartedAt, setCallStartedAt] = useState<Date | null>(null)
  const [calling, setCalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/twilio-numbers')
      .then((r) => r.json())
      .then((json) => {
        const nums: TwilioNumber[] = json.data ?? []
        setTwilioNumbers(nums)
        if (nums.length > 0) setFromNumber(nums[0].number)
      })
      .catch(() => {/* no numbers configured — that's ok */})
  }, [])

  async function startCall() {
    if (!contactPhone) { setError('No phone number on file for the primary contact'); return }
    setCalling(true)
    setError(null)
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerPhone: contactPhone, propertyId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to start call')
      setCallId(json.data?.id ?? null)
      setCallStartedAt(new Date())
      setStep('calling')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error starting call')
    } finally {
      setCalling(false)
    }
  }

  if (step === 'outcome') {
    return (
      <CallOutcomeModal
        propertyId={propertyId}
        callId={callId}
        callStartedAt={callStartedAt ?? new Date()}
        onClose={onClose}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-green-600" />
            <span className="font-semibold text-sm text-gray-900">
              {step === 'configure' ? 'Initiate Call' : 'Call in Progress'}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Property</p>
            <p className="text-sm font-medium text-gray-900">{propertyAddress}</p>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-0.5">Customer Phone</p>
            <p className={`text-sm font-mono ${contactPhone ? 'text-gray-900' : 'text-red-500'}`}>
              {contactPhone ?? 'No phone number on file'}
            </p>
          </div>

          {step === 'configure' && twilioNumbers.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Outbound Number</label>
              <select
                value={fromNumber}
                onChange={(e) => setFromNumber(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {twilioNumbers.map((n) => (
                  <option key={n.id} value={n.number}>
                    {n.friendlyName ? `${n.friendlyName} (${n.number})` : n.number}
                  </option>
                ))}
              </select>
            </div>
          )}

          {step === 'calling' && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
              📞 Connecting… Your phone will ring momentarily. When the call ends, log the outcome below.
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          {step === 'configure' && (
            <>
              <button
                onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={startCall}
                disabled={calling || !contactPhone}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-50"
              >
                {calling ? 'Calling…' : 'Call'}
              </button>
            </>
          )}
          {step === 'calling' && (
            <>
              <button
                onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-xl hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => setStep('outcome')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-xl"
              >
                Log Outcome
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add \
  apps/web/src/components/leads/CallOutcomeModal.tsx \
  apps/web/src/components/leads/InitiateCallModal.tsx
git commit -m "feat(gap-tags): add InitiateCallModal and CallOutcomeModal components"
```

---

## Task 5: QuickActionBar component

**Files:**
- Create: `apps/web/src/components/leads/QuickActionBar.tsx`

- [ ] **Step 1: Create the component**

```typescript
// apps/web/src/components/leads/QuickActionBar.tsx
'use client'

import { useState } from 'react'
import { Phone, MessageSquare, Mail } from 'lucide-react'
import { InitiateCallModal } from './InitiateCallModal'

interface Props {
  propertyId: string
  /** Primary contact phone number (null if no contacts) */
  contactPhone: string | null
  /** Human-readable address for the modal header */
  propertyAddress: string
}

/**
 * Sticky quick-action row matching REsimpli's lead detail page.
 * Call → opens InitiateCallModal (conference call flow)
 * SMS / Email → navigates to the comms tab
 */
export function QuickActionBar({ propertyId, contactPhone, propertyAddress }: Props) {
  const [callOpen, setCallOpen] = useState(false)

  function goToCommsTab() {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'comms')
    window.location.href = url.toString()
  }

  return (
    <>
      <div className="flex items-center gap-2 py-2.5 border-t border-gray-100 mt-1">
        <button
          onClick={() => setCallOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium bg-green-50 hover:bg-green-100 text-green-700 px-3 py-1.5 rounded-lg transition-colors border border-green-100"
        >
          <Phone className="w-3.5 h-3.5" />
          Call
        </button>
        <button
          onClick={goToCommsTab}
          className="flex items-center gap-1.5 text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg transition-colors border border-blue-100"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          SMS
        </button>
        <button
          onClick={goToCommsTab}
          className="flex items-center gap-1.5 text-xs font-medium bg-purple-50 hover:bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg transition-colors border border-purple-100"
        >
          <Mail className="w-3.5 h-3.5" />
          Email
        </button>
      </div>

      {callOpen && (
        <InitiateCallModal
          propertyId={propertyId}
          contactPhone={contactPhone}
          propertyAddress={propertyAddress}
          onClose={() => setCallOpen(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/leads/QuickActionBar.tsx
git commit -m "feat(gap-tags): add QuickActionBar component (Call/SMS/Email)"
```

---

## Task 6: Wire TagsCard + QuickActionBar into all 5 detail pages

**Files:**
- Modify: `apps/web/src/app/(app)/leads/dts/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/dta/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/tm/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/inventory/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/dispo/[id]/page.tsx`

The pattern is the same for all 5 pages. Instructions use DTS as the example — repeat identically for the other 4.

### DTS page (`apps/web/src/app/(app)/leads/dts/[id]/page.tsx`)

- [ ] **Step 1: Add imports to the DTS detail page**

Find the import block at the top of the file. After the existing imports, add:

```typescript
import { TagsCard } from '@/components/leads/TagsCard'
import { QuickActionBar } from '@/components/leads/QuickActionBar'
```

- [ ] **Step 2: Add `QuickActionBar` to the sticky header block**

Find the sticky header `<div>` that contains the `<LeadDetailHeader />` and `<DetailPageTabs />`. After the `<LeadDetailHeader ... />` component and before `<DetailPageTabs ... />`, add:

```tsx
<QuickActionBar
  propertyId={lead.id}
  contactPhone={lead.contacts[0]?.contact?.phone ?? null}
  propertyAddress={[lead.streetAddress, lead.city].filter(Boolean).join(', ') || 'Property'}
/>
```

The full sticky header block should look like this after the edit:

```tsx
<div className="sticky top-0 z-20 bg-white border-b border-gray-200 -mx-5 px-5 pt-3 pb-0">
  <Link href="/leads/dts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2">
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
  <QuickActionBar
    propertyId={lead.id}
    contactPhone={lead.contacts[0]?.contact?.phone ?? null}
    propertyAddress={[lead.streetAddress, lead.city].filter(Boolean).join(', ') || 'Property'}
  />
  <DetailPageTabs tabs={TABS} activeTab={tab} />
</div>
```

- [ ] **Step 3: Add `TagsCard` to the Overview tab**

Find the `{tab === 'overview' && (` block. In the right column (`<div>` after `col-span-2`), after the `<PropertyEditPanel ... />` component, add:

```tsx
<TagsCard
  propertyId={lead.id}
  initialTags={lead.tags}
/>
```

- [ ] **Step 4: Repeat for DTA page (`apps/web/src/app/(app)/leads/dta/[id]/page.tsx`)**

Read the DTA page, apply the same 3 changes:
1. Add the two imports
2. Add `<QuickActionBar>` between `<LeadDetailHeader>` and `<DetailPageTabs>`
3. Add `<TagsCard>` after `<PropertyEditPanel>` in the overview tab right column

The DTA page uses `pipeline="dta"` in `<LeadDetailHeader>` — keep that unchanged. Everything else is identical to Step 2 and 3.

- [ ] **Step 5: Repeat for TM page (`apps/web/src/app/(app)/tm/[id]/page.tsx`)**

Read the TM page. Apply:
1. Add the two imports
2. The TM page uses `<PipelineDetailHeader>` (not `<LeadDetailHeader>`). Find the sticky header div and add `<QuickActionBar>` between `<PipelineDetailHeader>` and `<DetailPageTabs>`. Contact phone is extracted from `property.contacts[0]?.contact?.phone ?? null`. Address: `[property.streetAddress, property.city].filter(Boolean).join(', ') || 'Property'`.
3. Add `<TagsCard propertyId={property.id} initialTags={property.tags} />` after `<PropertyEditPanel>` in the overview tab right column.

- [ ] **Step 6: Repeat for Inventory page (`apps/web/src/app/(app)/inventory/[id]/page.tsx`)**

Read the Inventory page. Apply identical pattern as TM:
1. Add two imports
2. Add `<QuickActionBar>` in sticky header after the detail header and before `<DetailPageTabs>`
3. Add `<TagsCard>` in overview tab right column after `<PropertyEditPanel>`

- [ ] **Step 7: Repeat for Dispo page (`apps/web/src/app/(app)/dispo/[id]/page.tsx`)**

Read the Dispo page. Apply identical pattern.

- [ ] **Step 8: Commit all 5 page changes**

```bash
git add \
  "apps/web/src/app/(app)/leads/dts/[id]/page.tsx" \
  "apps/web/src/app/(app)/leads/dta/[id]/page.tsx" \
  "apps/web/src/app/(app)/tm/[id]/page.tsx" \
  "apps/web/src/app/(app)/inventory/[id]/page.tsx" \
  "apps/web/src/app/(app)/dispo/[id]/page.tsx"
git commit -m "feat(gap-tags): wire TagsCard and QuickActionBar into all 5 detail pages"
```

---

## Spec Coverage Check

| Requirement | Task |
|------------|------|
| Tags displayed as chips on detail page | Task 2 — `TagsCard` chip display |
| "+Add Tag" button with input | Task 2 — `TagsCard` adding state |
| Remove tag (×) button per chip | Task 2 — `TagsCard` removeTag |
| Tag change recorded in activity log | Task 3 — PATCH route diff + TAG_ADDED/TAG_REMOVED |
| TAG_ADDED/TAG_REMOVED shown in Activity feed | Task 3 — ActivityCard ACTION_LABELS |
| "Call" button on detail page | Task 5 + 6 — QuickActionBar Call button |
| Pre-call modal with phone + outbound number picker | Task 4 — InitiateCallModal |
| Call initiated via POST /api/calls | Task 4 — InitiateCallModal startCall() |
| Call outcome disposition picker | Task 4 — CallOutcomeModal DISPOSITIONS |
| Outcome logged as Message record (CALL/OUTBOUND) | Task 4 — CallOutcomeModal POST /api/messages |
| Outcome shown in Communications tab | Task 4 — Message record → MessageThread |
| "SMS" + "Email" quick-access buttons | Task 5 + 6 — QuickActionBar navigates to comms tab |
| Twilio number list for picker | Task 1 — GET /api/twilio-numbers |
| Internal list-stacking tags hidden from chip UI | Task 2 — displayTags filter for `list:` prefix |
