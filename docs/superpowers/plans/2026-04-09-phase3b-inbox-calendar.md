# Phase 3B — Inbox & Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the global Inbox (conversation list + per-property message thread with manual call/note logging) and the Calendar page (appointment list with create/edit support).

**Architecture:** Same Server Component + Route Handler pattern. The `Message` and `Conversation` models are already in the Prisma schema. For Phase 3B, outbound SMS is queued via BullMQ to the Express API worker (which holds the Twilio credentials), but the UI posts to a Next.js Route Handler that enqueues the job. Inbound SMS webhook handling is in the Express API (`apps/api`). The calendar is purely within Next.js — no external Google Calendar integration yet.

**Tech Stack:** Next.js 15 App Router, Prisma 7, BullMQ 5, Redis, Zod, Tailwind CSS 4, Vitest, `date-fns`

---

## Actual Schema Field Names (MEMORIZE THESE)

```
Message:
  id, propertyId, conversationId?, channel: MessageChannel (SMS|CALL|RVM|EMAIL|NOTE|SYSTEM),
  direction: MessageDirection (INBOUND|OUTBOUND), body?, subject?, from?, to?,
  sentById?, isAiGenerated, aiReviewed, readAt?, deliveredAt?, failedAt?, failReason?,
  createdAt

Conversation:
  id, propertyId, contactPhone?, isRead, lastMessageAt?, createdAt, updatedAt
  messages: Message[]

Appointment:
  id, propertyId, title, description?, startAt, endAt, location?, attendees: String[],
  googleEventId?, createdAt, updatedAt

Note: body (NOT content), authorId, authorName
Task: dueAt (NOT dueDate), description (NOT notes)
ActivityLog: detail: Json (NOT description: String)
```

---

## File Map

```
NEW — lib & tests:
  apps/web/src/lib/inbox.ts                               ← getConversationList, getConversationMessages
  apps/web/src/lib/calendar.ts                            ← getAppointmentList
  apps/web/src/lib/__tests__/inbox.test.ts
  apps/web/src/lib/__tests__/calendar.test.ts

NEW — Route Handlers:
  apps/web/src/app/api/messages/route.ts                  ← POST: log a message (NOTE, CALL, EMAIL)
  apps/web/src/app/api/appointments/route.ts              ← POST: create appointment
  apps/web/src/app/api/appointments/[id]/route.ts         ← PATCH, DELETE appointment

NEW — Inbox Components:
  apps/web/src/components/inbox/ConversationListItem.tsx  ← single conversation row
  apps/web/src/components/inbox/MessageThread.tsx         ← message feed for one property
  apps/web/src/components/inbox/LogCommunicationForm.tsx  ← log call/note/email

NEW — Calendar Components:
  apps/web/src/components/calendar/AppointmentList.tsx    ← upcoming appointments table
  apps/web/src/components/calendar/AppointmentModal.tsx   ← create/edit appointment form

NEW — Inbox Pages:
  apps/web/src/app/(app)/inbox/page.tsx                   ← replace ComingSoon
  apps/web/src/app/(app)/inbox/[propertyId]/page.tsx      ← per-property message thread

NEW — Calendar Page:
  apps/web/src/app/(app)/calendar/page.tsx                ← replace ComingSoon
```

---

### Task 1: Inbox & Calendar Query Helpers

**Files:**
- Create: `apps/web/src/lib/inbox.ts`
- Create: `apps/web/src/lib/calendar.ts`
- Create: `apps/web/src/lib/__tests__/inbox.test.ts`
- Create: `apps/web/src/lib/__tests__/calendar.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/__tests__/inbox.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getConversationList, getConversationMessages } from '@/lib/inbox'

describe('getConversationList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches conversations ordered by lastMessageAt desc', async () => {
    ;(prisma.conversation.findMany as any).mockResolvedValue([])
    ;(prisma.conversation.count as any).mockResolvedValue(0)

    await getConversationList({})

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { lastMessageAt: 'desc' },
      })
    )
  })

  it('includes property and message count', async () => {
    ;(prisma.conversation.findMany as any).mockResolvedValue([])
    ;(prisma.conversation.count as any).mockResolvedValue(0)

    await getConversationList({})

    const call = (prisma.conversation.findMany as any).mock.calls[0][0]
    expect(call.include).toBeDefined()
  })
})

describe('getConversationMessages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches messages for a property ordered by createdAt asc', async () => {
    ;(prisma.message.findMany as any).mockResolvedValue([])

    await getConversationMessages('prop-1')

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { propertyId: 'prop-1' },
        orderBy: { createdAt: 'asc' },
      })
    )
  })
})
```

Create `apps/web/src/lib/__tests__/calendar.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    appointment: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getAppointmentList } from '@/lib/calendar'

describe('getAppointmentList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches upcoming appointments by default', async () => {
    ;(prisma.appointment.findMany as any).mockResolvedValue([])
    ;(prisma.appointment.count as any).mockResolvedValue(0)

    await getAppointmentList({})

    const call = (prisma.appointment.findMany as any).mock.calls[0][0]
    expect(call.where.startAt).toBeDefined()
  })

  it('includes property info', async () => {
    ;(prisma.appointment.findMany as any).mockResolvedValue([])
    ;(prisma.appointment.count as any).mockResolvedValue(0)

    await getAppointmentList({})

    const call = (prisma.appointment.findMany as any).mock.calls[0][0]
    expect(call.include?.property).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/inbox.test.ts src/lib/__tests__/calendar.test.ts 2>&1 | tail -15
```
Expected: FAIL — functions not found

- [ ] **Step 3: Write inbox.ts**

Create `apps/web/src/lib/inbox.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export interface ConversationListFilter {
  unreadOnly?: boolean
  page?: number
  pageSize?: number
}

export async function getConversationList(filter: ConversationListFilter) {
  const { unreadOnly, page = 1, pageSize = 50 } = filter

  const where: Prisma.ConversationWhereInput = {
    ...(unreadOnly && { isRead: false }),
  }

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        property: {
          select: {
            id: true,
            streetAddress: true,
            city: true,
            state: true,
            leadType: true,
          },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.conversation.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function getConversationMessages(propertyId: string, limit = 200) {
  return prisma.message.findMany({
    where: { propertyId },
    include: {
      sentBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
}
```

- [ ] **Step 4: Write calendar.ts**

Create `apps/web/src/lib/calendar.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export interface AppointmentListFilter {
  propertyId?: string
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
}

export async function getAppointmentList(filter: AppointmentListFilter) {
  const { propertyId, from, to, page = 1, pageSize = 50 } = filter

  const now = new Date()

  const where: Prisma.AppointmentWhereInput = {
    startAt: {
      gte: from ?? now,
      ...(to && { lte: to }),
    },
    ...(propertyId && { propertyId }),
  }

  const [rows, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: {
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
      orderBy: { startAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.appointment.count({ where }),
  ])

  return { rows, total, page, pageSize }
}
```

- [ ] **Step 5: Run tests — confirm PASS**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run src/lib/__tests__/inbox.test.ts src/lib/__tests__/calendar.test.ts 2>&1 | tail -15
```
Expected: PASS — 4 tests

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/lib/inbox.ts apps/web/src/lib/calendar.ts apps/web/src/lib/__tests__/inbox.test.ts apps/web/src/lib/__tests__/calendar.test.ts
git commit -m "feat: add inbox and calendar query helpers with tests"
```

---

### Task 2: Message & Appointment Route Handlers

**Files:**
- Create: `apps/web/src/app/api/messages/route.ts`
- Create: `apps/web/src/app/api/appointments/route.ts`
- Create: `apps/web/src/app/api/appointments/[id]/route.ts`

- [ ] **Step 1: Write message Route Handler**

Create `apps/web/src/app/api/messages/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const LogMessageSchema = z.object({
  propertyId: z.string().min(1),
  channel: z.enum(['CALL', 'NOTE', 'EMAIL', 'SMS']),
  body: z.string().min(1).max(10000),
  subject: z.string().optional(),
  direction: z.enum(['INBOUND', 'OUTBOUND']).default('OUTBOUND'),
  contactPhone: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const body = await req.json()
  const parsed = LogMessageSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { propertyId, channel, body: messageBody, subject, direction, contactPhone } = parsed.data

  // Ensure a Conversation record exists for this property
  let conversation = await prisma.conversation.findFirst({
    where: { propertyId },
  })

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        propertyId,
        contactPhone: contactPhone ?? null,
        isRead: true,
        lastMessageAt: new Date(),
      },
    })
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), isRead: true },
    })
  }

  const message = await prisma.message.create({
    data: {
      propertyId,
      conversationId: conversation.id,
      channel,
      direction,
      body: messageBody,
      subject,
      sentById: userId,
    },
  })

  await prisma.activityLog.create({
    data: {
      propertyId,
      userId,
      action: 'MESSAGE_LOGGED',
      detail: { description: `${channel} ${direction === 'INBOUND' ? 'received' : 'logged'}` },
    },
  })

  return NextResponse.json({ success: true, data: message }, { status: 201 })
}
```

- [ ] **Step 2: Write appointment Route Handlers**

Create `apps/web/src/app/api/appointments/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CreateAppointmentSchema = z.object({
  propertyId: z.string().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  location: z.string().optional(),
  attendees: z.array(z.string()).default([]),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateAppointmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const appointment = await prisma.appointment.create({
    data: {
      ...parsed.data,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
    },
  })

  return NextResponse.json({ success: true, data: appointment }, { status: 201 })
}
```

Create `apps/web/src/app/api/appointments/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const UpdateAppointmentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string()).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateAppointmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const updates: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.startAt) updates.startAt = new Date(parsed.data.startAt)
  if (parsed.data.endAt) updates.endAt = new Date(parsed.data.endAt)

  const appointment = await prisma.appointment.update({
    where: { id },
    data: updates,
  })

  return NextResponse.json({ success: true, data: appointment })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.appointment.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | grep "error TS" | head -20
```
Fix any errors in the files you just wrote.

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/app/api/messages/ apps/web/src/app/api/appointments/
git commit -m "feat: add message logging and appointment route handlers"
```

---

### Task 3: Inbox Components

**Files:**
- Create: `apps/web/src/components/inbox/MessageThread.tsx`
- Create: `apps/web/src/components/inbox/LogCommunicationForm.tsx`

- [ ] **Step 1: Write MessageThread**

Create `apps/web/src/components/inbox/MessageThread.tsx`:

```typescript
'use client'

import { formatDistanceToNow, format } from 'date-fns'
import { Phone, Mail, MessageSquare, FileText, Volume2 } from 'lucide-react'

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  SMS:   <MessageSquare className="w-3.5 h-3.5" />,
  CALL:  <Phone className="w-3.5 h-3.5" />,
  EMAIL: <Mail className="w-3.5 h-3.5" />,
  NOTE:  <FileText className="w-3.5 h-3.5" />,
  RVM:   <Volume2 className="w-3.5 h-3.5" />,
}

const CHANNEL_COLORS: Record<string, string> = {
  SMS:    'bg-blue-50 text-blue-700',
  CALL:   'bg-green-50 text-green-700',
  EMAIL:  'bg-purple-50 text-purple-700',
  NOTE:   'bg-gray-100 text-gray-600',
  RVM:    'bg-yellow-50 text-yellow-700',
  SYSTEM: 'bg-gray-50 text-gray-500',
}

interface Message {
  id: string
  channel: string
  direction: string
  body: string | null
  subject: string | null
  createdAt: Date
  sentBy: { name: string } | null
}

interface Props {
  messages: Message[]
}

export function MessageThread({ messages }: Props) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        No communications yet
      </div>
    )
  }

  // Group messages by date
  const grouped = messages.reduce<Array<{ date: string; msgs: Message[] }>>((acc, msg) => {
    const dateKey = format(new Date(msg.createdAt), 'MMMM d, yyyy')
    const last = acc[acc.length - 1]
    if (last?.date === dateKey) {
      last.msgs.push(msg)
    } else {
      acc.push({ date: dateKey, msgs: [msg] })
    }
    return acc
  }, [])

  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <div key={group.date}>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[11px] text-gray-400 font-medium">{group.date}</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          <div className="space-y-2">
            {group.msgs.map((msg) => {
              const isOutbound = msg.direction === 'OUTBOUND'
              return (
                <div
                  key={msg.id}
                  className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[75%] ${isOutbound ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    <div className={`flex items-center gap-1.5 ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${CHANNEL_COLORS[msg.channel] ?? 'bg-gray-100 text-gray-600'}`}>
                        {CHANNEL_ICONS[msg.channel]}
                        {msg.channel}
                      </span>
                      <span className="text-[10px] text-gray-400">{msg.sentBy?.name ?? 'System'}</span>
                    </div>
                    {msg.subject && (
                      <p className="text-[11px] font-semibold text-gray-700">{msg.subject}</p>
                    )}
                    <div className={`px-3 py-2 rounded-xl text-sm ${
                      isOutbound
                        ? 'bg-blue-600 text-white rounded-tr-sm'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                    }`}>
                      {msg.body ?? <em className="opacity-60">No content</em>}
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Write LogCommunicationForm**

Create `apps/web/src/components/inbox/LogCommunicationForm.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, FileText, Mail } from 'lucide-react'

const CHANNELS = [
  { value: 'CALL',  label: 'Call',  icon: <Phone className="w-3.5 h-3.5" /> },
  { value: 'NOTE',  label: 'Note',  icon: <FileText className="w-3.5 h-3.5" /> },
  { value: 'EMAIL', label: 'Email', icon: <Mail className="w-3.5 h-3.5" /> },
]

interface Props {
  propertyId: string
}

export function LogCommunicationForm({ propertyId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [channel, setChannel] = useState('CALL')
  const [direction, setDirection] = useState('OUTBOUND')
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!body.trim()) return
    setError(null)

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId, channel, direction, body, subject: subject || undefined }),
    })

    if (!res.ok) {
      const json = await res.json()
      setError(json.error ?? 'Failed to log communication')
      return
    }

    setBody('')
    setSubject('')
    startTransition(() => router.refresh())
  }

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center gap-2 mb-2">
        {CHANNELS.map((c) => (
          <button
            key={c.value}
            onClick={() => setChannel(c.value)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              channel === c.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {c.icon}
            {c.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {(['OUTBOUND', 'INBOUND'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                direction === d ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d === 'OUTBOUND' ? 'Out' : 'In'}
            </button>
          ))}
        </div>
      </div>

      {channel === 'EMAIL' && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            channel === 'CALL' ? 'Call notes...' :
            channel === 'EMAIL' ? 'Email body...' :
            'Note...'
          }
          rows={2}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={submit}
          disabled={isPending || !body.trim()}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 self-end"
        >
          {isPending ? '...' : 'Log'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/components/inbox/
git commit -m "feat: add MessageThread and LogCommunicationForm components"
```

---

### Task 4: Calendar Component

**Files:**
- Create: `apps/web/src/components/calendar/AppointmentList.tsx`
- Create: `apps/web/src/components/calendar/AppointmentModal.tsx`

- [ ] **Step 1: Write AppointmentList**

Create `apps/web/src/components/calendar/AppointmentList.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { format, formatDistanceToNow, isPast } from 'date-fns'
import { MapPin, Clock, Trash2 } from 'lucide-react'

interface AppointmentRow {
  id: string
  title: string
  description: string | null
  startAt: Date
  endAt: Date
  location: string | null
  attendees: string[]
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    state: string | null
    leadType: string
  } | null
}

interface Props {
  rows: AppointmentRow[]
  total: number
}

export function AppointmentList({ rows, total }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  async function deleteAppointment(apptId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this appointment?')) return
    await fetch(`/api/appointments/${apptId}`, { method: 'DELETE' })
    startTransition(() => router.refresh())
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No upcoming appointments</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map((appt) => {
        const pipeline = appt.property?.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
        const isUpcoming = !isPast(new Date(appt.startAt))
        return (
          <div
            key={appt.id}
            className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isUpcoming ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{appt.title}</h3>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {format(new Date(appt.startAt), 'MMM d, h:mm a')} – {format(new Date(appt.endAt), 'h:mm a')}
                    <span className="text-gray-400 ml-1">({formatDistanceToNow(new Date(appt.startAt), { addSuffix: true })})</span>
                  </span>
                  {appt.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {appt.location}
                    </span>
                  )}
                </div>
                {appt.property && (
                  <button
                    onClick={() => router.push(`/leads/${pipeline}/${appt.property!.id}`)}
                    className="mt-1 text-[11px] text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    {appt.property.streetAddress ?? 'Unknown property'}, {appt.property.city}
                  </button>
                )}
                {appt.description && (
                  <p className="mt-1 text-[11px] text-gray-500 line-clamp-2">{appt.description}</p>
                )}
              </div>
              <button
                onClick={(e) => deleteAppointment(appt.id, e)}
                className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                title="Delete appointment"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Write AppointmentModal**

Create `apps/web/src/components/calendar/AppointmentModal.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  open: boolean
  onClose: () => void
  defaultPropertyId?: string
}

export function AppointmentModal({ open, onClose, defaultPropertyId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    const startDate = fd.get('startDate') as string
    const startTime = fd.get('startTime') as string
    const endTime = fd.get('endTime') as string

    const body = {
      title: fd.get('title') as string,
      description: (fd.get('description') as string) || undefined,
      startAt: new Date(`${startDate}T${startTime}`).toISOString(),
      endAt: new Date(`${startDate}T${endTime}`).toISOString(),
      location: (fd.get('location') as string) || undefined,
      propertyId: defaultPropertyId ?? (fd.get('propertyId') as string) || undefined,
    }

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const json = await res.json()
      setError(typeof json.error === 'string' ? json.error : 'Failed to create appointment')
      return
    }

    startTransition(() => {
      router.refresh()
      onClose()
    })
  }

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const defaultDate = tomorrow.toISOString().split('T')[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">New Appointment</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <input
              name="title"
              required
              placeholder="Property walkthrough"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
              <input
                name="startDate"
                type="date"
                required
                defaultValue={defaultDate}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Start *</label>
              <input
                name="startTime"
                type="time"
                required
                defaultValue="10:00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">End *</label>
              <input
                name="endTime"
                type="time"
                required
                defaultValue="11:00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
            <input
              name="location"
              placeholder="123 Main St, Dallas TX"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              name="description"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add apps/web/src/components/calendar/
git commit -m "feat: add AppointmentList and AppointmentModal components"
```

---

### Task 5: Inbox Pages

**Files:**
- Modify: `apps/web/src/app/(app)/inbox/page.tsx`
- Create: `apps/web/src/app/(app)/inbox/[propertyId]/page.tsx`

- [ ] **Step 1: Write global inbox page**

Replace `apps/web/src/app/(app)/inbox/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getConversationList } from '@/lib/inbox'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'

export default async function InboxPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { rows, total } = await getConversationList({ pageSize: 100 })

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Inbox</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">
        {total} conversation{total !== 1 ? 's' : ''}
      </p>

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
          <div className="text-center">
            <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No conversations yet</p>
            <p className="text-xs text-gray-400 mt-1">Conversations will appear here as you log communications from leads</p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
          {rows.map((conv) => {
            const property = conv.property
            return (
              <Link
                key={conv.id}
                href={`/inbox/${property?.id ?? conv.id}`}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${!conv.isRead ? 'bg-blue-50/30' : ''}`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${!conv.isRead ? 'bg-blue-500' : 'bg-transparent'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${!conv.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {property?.streetAddress ?? 'Unknown Property'}
                    {property?.city && <span className="text-gray-400 font-normal"> · {property.city}</span>}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {conv._count.messages} message{conv._count.messages !== 1 ? 's' : ''}
                    {conv.contactPhone && ` · ${conv.contactPhone}`}
                  </p>
                </div>
                <span className="text-[11px] text-gray-400 flex-shrink-0">
                  {conv.lastMessageAt
                    ? formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })
                    : '—'}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write per-property inbox page**

Create `apps/web/src/app/(app)/inbox/[propertyId]/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getConversationMessages } from '@/lib/inbox'
import { prisma } from '@/lib/prisma'
import { MessageThread } from '@/components/inbox/MessageThread'
import { LogCommunicationForm } from '@/components/inbox/LogCommunicationForm'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type Params = { params: Promise<{ propertyId: string }> }

export default async function InboxPropertyPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { propertyId } = await params

  const [property, messages] = await Promise.all([
    prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        streetAddress: true,
        city: true,
        state: true,
        leadType: true,
        propertyStatus: true,
      },
    }),
    getConversationMessages(propertyId),
  ])

  if (!property) notFound()

  const pipeline = property.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/inbox" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ChevronLeft className="w-4 h-4" />
          Inbox
        </Link>
        <span className="text-gray-300">/</span>
        <Link
          href={`/leads/${pipeline}/${property.id}`}
          className="text-sm font-medium text-gray-900 hover:text-blue-600"
        >
          {property.streetAddress ?? 'Unknown'}{property.city && `, ${property.city}`}
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto max-h-[60vh] mb-4">
          <MessageThread messages={messages as any} />
        </div>
        <LogCommunicationForm propertyId={propertyId} />
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
git add "apps/web/src/app/(app)/inbox/"
git commit -m "feat: implement inbox pages (conversation list + per-property thread)"
```

---

### Task 6: Calendar Page

**Files:**
- Modify: `apps/web/src/app/(app)/calendar/page.tsx`

- [ ] **Step 1: Write calendar page**

Replace `apps/web/src/app/(app)/calendar/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppointmentModal } from '@/components/calendar/AppointmentModal'
import { Plus } from 'lucide-react'

// This is a Client Component wrapper because we need the modal state
// The actual appointment list is loaded by the Server Component below

export default function CalendarPageWrapper() {
  return <CalendarPageClient />
}

function CalendarPageClient() {
  const [modalOpen, setModalOpen] = useState(false)
  const router = useRouter()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
          <p className="text-sm text-gray-500 mt-0.5">Upcoming appointments</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Appointment
        </button>
      </div>

      <AppointmentListLoader />

      <AppointmentModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
```

**Note:** The Calendar page is a Client Component because it needs the `AppointmentModal` state. The actual appointment list must be loaded server-side. Split it into a Server Component for the data and a Client wrapper:

Replace `apps/web/src/app/(app)/calendar/page.tsx` with this two-component approach:

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getAppointmentList } from '@/lib/calendar'
import { AppointmentList } from '@/components/calendar/AppointmentList'
import { CalendarHeader } from '@/components/calendar/CalendarHeader'

export default async function CalendarPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { rows, total } = await getAppointmentList({ pageSize: 100 })

  return (
    <div>
      <CalendarHeader />
      <AppointmentList rows={rows as any} total={total} />
    </div>
  )
}
```

Create `apps/web/src/components/calendar/CalendarHeader.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AppointmentModal } from './AppointmentModal'

export function CalendarHeader() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
          <p className="text-sm text-gray-500 mt-0.5">Upcoming appointments</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Appointment
        </button>
      </div>
      <AppointmentModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | grep "error TS" | head -20
```

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add "apps/web/src/app/(app)/calendar/" apps/web/src/components/calendar/CalendarHeader.tsx
git commit -m "feat: implement calendar page with appointment list and create modal"
```

---

### Task 7: Build Verification

**Files:** None — verification only

- [ ] **Step 1: Run all tests**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec vitest run 2>&1 | tail -20
PATH=/c/node-x64:$PATH pnpm --filter @crm/shared exec vitest run 2>&1 | tail -10
PATH=/c/node-x64:$PATH pnpm --filter @crm/api exec vitest run 2>&1 | tail -10
```
Expected: All 32 tests passing (28 from Phase 3A + 4 new inbox/calendar helpers)

- [ ] **Step 2: TypeScript check**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
PATH=/c/node-x64:$PATH pnpm --filter @crm/web exec tsc --noEmit 2>&1 | grep "error TS" | head -30
```

- [ ] **Step 3: Next.js build**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web"
PATH=/c/node-x64:$PATH /c/node-x64/node.exe node_modules/.bin/next build 2>&1 | tail -30
```
Expected: Build succeeds, inbox and calendar routes appear

- [ ] **Step 4: Final commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add -A
git commit -m "feat: Phase 3B complete — Inbox and Calendar"
```

---

## Summary

**What Phase 3B delivers:**
- Global Inbox (`/inbox`) showing all conversations sorted by last activity
- Per-property message thread (`/inbox/[propertyId]`) with full history
- Manual communication logging (Call, Note, Email) from the thread
- Calendar page (`/calendar`) with upcoming appointments
- Create appointment modal with date/time/location
- Delete appointment

**What Phase 3B does NOT include:**
- Real Twilio SMS send/receive → Phase 4 (requires credentials + inbound webhook)
- Two-way SMS from inbox → Phase 4
- Google Calendar sync → Phase 5
- Email client (`/email`) → Phase 4
