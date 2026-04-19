# Call Whisper / Barge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let supervisors see all active calls in a live dashboard and join any call in whisper mode (speak privately to the agent) or barge mode (all three parties hear each other) using Twilio Conferences + Coach API.

**Architecture:** When an agent initiates an outbound call, both the agent's phone and the customer's phone are dialed independently by Twilio and placed into a named Conference room (two-leg approach). A supervisor can then join the conference via Twilio's Participant + coaching API. Call state is persisted in a new `ActiveCall` Prisma model and updated via Twilio status webhooks. The UI auto-refreshes every 5 seconds via polling.

**Tech Stack:** Twilio REST API (`twilio` npm package, already installed in `apps/api`), Next.js 15 App Router route handlers, Prisma, plain HTML + Tailwind CSS (no shadcn/ui).

---

## Environment Variables

Add to `.env` (document these in `apps/web/src/app/(app)/settings/page.tsx` Twilio tab):

```
TWILIO_TWIML_HOST=https://your-ngrok-or-domain.com   # public base URL Twilio can reach
```

Already present (confirm before running):
```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_DEFAULT_NUMBER=+1xxxxxxxxxx   # outbound caller ID
```

Supervisor and agent phone numbers come from `User.phone` (already in schema) — no additional env vars needed.

---

## How the Two-Leg Conference Call Works

```
1. Agent clicks "Call" in the UI (or on a lead detail page)
2. POST /api/calls → creates unique conferenceName, dials agent's User.phone and customer phone
   - Both legs use calls.create({ url: TWIML_HOST/api/calls/twiml?conference=NAME })
   - TwiML response: <Conference startConferenceOnEnter="true">NAME</Conference>
3. Both legs join the named Conference → Twilio creates Conference SID
4. Twilio POSTs status callbacks → PATCH /api/webhooks/twilio-call updates ActiveCall
   (conference SID populated when first leg answers)
5. Supervisor opens /calls, sees active call
6. Supervisor clicks Whisper → POST /api/calls/:id/coach { mode: 'WHISPER' }
   - Twilio dials supervisor's User.phone, adds them to conference with coaching=true, callSidToCoach=agentCallSid
   - Supervisor hears both agent + customer; only agent hears supervisor
7. Supervisor clicks Barge → same but coaching=false (all three hear each other)
8. Any party hangs up → status webhook fires → ActiveCall.status = COMPLETED
```

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/database/prisma/schema.prisma` | Modify | Add `ActiveCall` model + User back-relation |
| `apps/web/src/lib/twilio-calls.ts` | Create | Twilio REST helpers: dial, add supervisor, hang up |
| `apps/web/src/app/api/calls/twiml/route.ts` | Create | TwiML endpoint: conference join instructions |
| `apps/web/src/app/api/calls/route.ts` | Create | POST initiate call; GET list active calls |
| `apps/web/src/app/api/calls/[id]/coach/route.ts` | Create | POST join as whisper or barge |
| `apps/web/src/app/api/calls/[id]/hangup/route.ts` | Create | POST end the call |
| `apps/web/src/app/api/webhooks/twilio-call/route.ts` | Create | POST status webhook from Twilio |
| `apps/web/src/components/calls/ActiveCallsPanel.tsx` | Create | Auto-refreshing calls table with action buttons |
| `apps/web/src/app/(app)/calls/page.tsx` | Create | Supervisor calls page |
| `apps/web/src/components/layout/Sidebar.tsx` | Modify | Add "Calls" to Tools section |
| `apps/web/src/app/(app)/settings/page.tsx` | Modify | Add TWILIO_TWIML_HOST + voice webhook URL to Twilio tab |

---

## Task 1: Add `ActiveCall` model to schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Add `ActiveCall` model at end of schema**

Open `packages/database/prisma/schema.prisma`. After the `FinancialGoal` model (the last model in the file), append:

```prisma
model ActiveCall {
  id                String    @id @default(cuid())
  conferenceId      String?   @unique    // Twilio Conference SID (CF…), populated via webhook
  conferenceName    String    @unique    // our generated unique room name
  agentCallSid      String?              // Twilio Call SID for agent's leg
  customerCallSid   String?              // Twilio Call SID for customer's leg
  supervisorCallSid String?              // Twilio Call SID for supervisor's leg (if joined)
  propertyId        String?
  property          Property? @relation(fields: [propertyId], references: [id])
  agentUserId       String?
  agent             User?     @relation("AgentCalls", fields: [agentUserId], references: [id])
  customerPhone     String?
  status            String    @default("INITIATING") // INITIATING | RINGING | ACTIVE | COMPLETED
  supervisorMode    String?                           // WHISPER | BARGE (set when supervisor joins)
  startedAt         DateTime  @default(now())
  endedAt           DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

- [ ] **Step 2: Add back-relation to `User` model**

In the `User` model, after the `savedFilters SavedFilter[]` line, add:

```prisma
  activeCalls       ActiveCall[] @relation("AgentCalls")
```

- [ ] **Step 3: Add back-relation to `Property` model**

In the `Property` model, find the relations section (look for `assignedTo`, `createdBy`). Add:

```prisma
  activeCalls       ActiveCall[]
```

- [ ] **Step 4: Commit schema change**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "feat(gap5): add ActiveCall schema model"
```

- [ ] **Step 5: Document db:push requirement**

The user must run this before the new model is available:
```bash
export PATH="/c/Users/suban/AppData/Local/nvm/v24.14.1:$PATH"
node "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/node_modules/.pnpm/prisma@6.19.3_typescript@5.9.3/node_modules/prisma/build/index.js" db push --schema "packages/database/prisma/schema.prisma"
```

---

## Task 2: Twilio call helpers library

**Files:**
- Create: `apps/web/src/lib/twilio-calls.ts`

All Twilio REST calls live here. Uses `(prisma as any).activeCall` pattern since the model may not be type-generated yet.

- [ ] **Step 1: Create `apps/web/src/lib/twilio-calls.ts`**

```typescript
/**
 * Twilio conference call helpers
 *
 * Manages outbound conference calls, supervisor coaching (whisper/barge),
 * and call termination via Twilio REST API.
 *
 * Falls back to mock mode when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are absent.
 */

import twilio from 'twilio'

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const DEFAULT_NUMBER = process.env.TWILIO_DEFAULT_NUMBER ?? ''
const TWIML_HOST = process.env.TWILIO_TWIML_HOST ?? 'http://localhost:3000'

function getClient() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) return null
  return twilio(ACCOUNT_SID, AUTH_TOKEN)
}

/**
 * Generate a URL-safe unique conference room name.
 */
export function generateConferenceName(): string {
  return `conf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Build the TwiML URL for a conference leg.
 * Twilio calls this URL when the dialed party answers.
 */
export function buildTwimlUrl(conferenceName: string): string {
  return `${TWIML_HOST}/api/calls/twiml?conference=${encodeURIComponent(conferenceName)}`
}

/**
 * Build the status callback URL for Twilio to report call status changes.
 */
export function buildStatusCallbackUrl(): string {
  return `${TWIML_HOST}/api/webhooks/twilio-call`
}

/**
 * Dial both the agent and the customer into a named conference.
 * Returns the Twilio Call SIDs for both legs.
 *
 * @param agentPhone      Agent's E.164 phone number (from User.phone)
 * @param customerPhone   Customer's E.164 phone number
 * @param conferenceName  Unique conference room name
 */
export async function makeConferenceCall(
  agentPhone: string,
  customerPhone: string,
  conferenceName: string,
): Promise<{ agentCallSid: string; customerCallSid: string }> {
  const client = getClient()
  const twimlUrl = buildTwimlUrl(conferenceName)
  const statusCallbackUrl = buildStatusCallbackUrl()

  if (!client) {
    console.log(`[twilio-calls] MOCK conference "${conferenceName}": agent=${agentPhone} customer=${customerPhone}`)
    return {
      agentCallSid: `mock-agent-${Date.now()}`,
      customerCallSid: `mock-customer-${Date.now()}`,
    }
  }

  // Dial both legs in parallel
  const [agentCall, customerCall] = await Promise.all([
    client.calls.create({
      to: agentPhone,
      from: DEFAULT_NUMBER,
      url: twimlUrl,
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    }),
    client.calls.create({
      to: customerPhone,
      from: DEFAULT_NUMBER,
      url: twimlUrl,
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    }),
  ])

  return {
    agentCallSid: agentCall.sid,
    customerCallSid: customerCall.sid,
  }
}

/**
 * Add a supervisor to an existing conference in WHISPER mode.
 * The supervisor can hear and speak to the agent; the customer cannot hear the supervisor.
 *
 * @param conferenceSid  Twilio Conference SID (CF…)
 * @param supervisorPhone  Supervisor's E.164 phone number
 * @param agentCallSid   Call SID of the agent's leg (required for coaching)
 * @returns Supervisor's Call SID
 */
export async function addWhisperParticipant(
  conferenceSid: string,
  supervisorPhone: string,
  agentCallSid: string,
): Promise<string> {
  const client = getClient()

  if (!client) {
    console.log(`[twilio-calls] MOCK whisper: supervisor=${supervisorPhone} coaching agent=${agentCallSid}`)
    return `mock-supervisor-${Date.now()}`
  }

  const participant = await client.conferences(conferenceSid).participants.create({
    to: supervisorPhone,
    from: DEFAULT_NUMBER,
    coaching: true,
    callSidToCoach: agentCallSid,
    beep: 'false',
  } as any)

  return participant.callSid
}

/**
 * Add a supervisor to an existing conference in BARGE mode.
 * All three parties (agent, customer, supervisor) hear each other.
 *
 * @param conferenceSid  Twilio Conference SID (CF…)
 * @param supervisorPhone  Supervisor's E.164 phone number
 * @returns Supervisor's Call SID
 */
export async function addBargeParticipant(
  conferenceSid: string,
  supervisorPhone: string,
): Promise<string> {
  const client = getClient()

  if (!client) {
    console.log(`[twilio-calls] MOCK barge: supervisor=${supervisorPhone} in conf=${conferenceSid}`)
    return `mock-supervisor-barge-${Date.now()}`
  }

  const participant = await client.conferences(conferenceSid).participants.create({
    to: supervisorPhone,
    from: DEFAULT_NUMBER,
    beep: 'false',
  })

  return participant.callSid
}

/**
 * Hang up a call by SID.
 */
export async function hangupCall(callSid: string): Promise<void> {
  const client = getClient()

  if (!client) {
    console.log(`[twilio-calls] MOCK hangup: callSid=${callSid}`)
    return
  }

  await client.calls(callSid).update({ status: 'completed' })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/twilio-calls.ts
git commit -m "feat(gap5): add twilio-calls.ts conference helpers"
```

---

## Task 3: TwiML endpoint

**Files:**
- Create: `apps/web/src/app/api/calls/twiml/route.ts`

Twilio calls this URL when a dialed party answers. Returns XML that joins them to the named conference.

- [ ] **Step 1: Create TwiML route**

```typescript
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET/POST /api/calls/twiml?conference=<name>
 *
 * Called by Twilio when a dialed party answers.
 * Returns TwiML that joins the caller to the named conference.
 *
 * No auth required — Twilio calls this directly.
 * The conferenceName is a random token (not guessable) so SSRF is not a concern.
 */
export async function GET(req: NextRequest) {
  return buildTwimlResponse(req)
}

export async function POST(req: NextRequest) {
  return buildTwimlResponse(req)
}

function buildTwimlResponse(req: NextRequest): NextResponse {
  const { searchParams } = new URL(req.url)
  const conference = searchParams.get('conference')

  if (!conference) {
    return NextResponse.json({ error: 'Missing conference param' }, { status: 400 })
  }

  // Sanitize: only allow alphanumeric, hyphens, underscores
  const safeName = conference.replace(/[^a-zA-Z0-9\-_]/g, '')

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference
      beep="false"
      startConferenceOnEnter="true"
      endConferenceOnExit="false"
      waitUrl=""
      muted="false"
    >${safeName}</Conference>
  </Dial>
</Response>`

  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/calls/twiml/route.ts
git commit -m "feat(gap5): add TwiML conference entry endpoint"
```

---

## Task 4: Status webhook

**Files:**
- Create: `apps/web/src/app/api/webhooks/twilio-call/route.ts`

Twilio POSTs call status changes here. Used to:
- Populate `conferenceId` when the conference is created
- Update `agentCallSid` / `customerCallSid` when calls connect
- Mark calls `ACTIVE` / `COMPLETED` with timestamps

- [ ] **Step 1: Create the webhook route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/webhooks/twilio-call
 *
 * Receives Twilio call status callbacks.
 * Twilio sends form-encoded body with fields like:
 *   CallSid, CallStatus, ConferenceSid, To, From, Direction
 *
 * No auth required — Twilio posts directly.
 * In production, validate X-Twilio-Signature (same pattern as webhooks/twilio).
 */
export async function POST(req: NextRequest) {
  let params: Record<string, string>

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    params = await req.json()
  } else {
    // Twilio sends application/x-www-form-urlencoded
    const text = await req.text()
    params = Object.fromEntries(new URLSearchParams(text))
  }

  const { CallSid, CallStatus, ConferenceSid, To } = params

  if (!CallSid) {
    return NextResponse.json({ ok: true }) // ignore malformed
  }

  try {
    // Find the ActiveCall matching this call SID (agent or customer leg)
    const activeCall = await (prisma as any).activeCall.findFirst({
      where: {
        OR: [
          { agentCallSid: CallSid },
          { customerCallSid: CallSid },
          { supervisorCallSid: CallSid },
        ],
      },
    })

    if (!activeCall) {
      // Unknown call — ignore
      return NextResponse.json({ ok: true })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }

    // Populate conference SID when first known
    if (ConferenceSid && !activeCall.conferenceId) {
      updates.conferenceId = ConferenceSid
    }

    // Update call status
    if (CallStatus === 'in-progress' && activeCall.status !== 'ACTIVE') {
      updates.status = 'ACTIVE'
    }

    if (CallStatus === 'completed') {
      // Only mark COMPLETED when the agent leg ends (endConferenceOnExit agent leg)
      if (CallSid === activeCall.agentCallSid) {
        updates.status = 'COMPLETED'
        updates.endedAt = new Date()
      }
    }

    await (prisma as any).activeCall.update({
      where: { id: activeCall.id },
      data: updates,
    })
  } catch (err) {
    console.error('[webhook/twilio-call]', err)
  }

  // Always return 200 to Twilio
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/webhooks/twilio-call/route.ts
git commit -m "feat(gap5): add Twilio call status webhook"
```

---

## Task 5: Calls API route (initiate + list)

**Files:**
- Create: `apps/web/src/app/api/calls/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  makeConferenceCall,
  generateConferenceName,
} from '@/lib/twilio-calls'
import { requirePermission } from '@/lib/auth-utils'

const InitiateCallSchema = z.object({
  customerPhone: z.string().min(7),
  propertyId: z.string().optional(),
})

/**
 * POST /api/calls
 * Initiate an outbound conference call (agent + customer into a conference room).
 * Requires the authenticated user to have User.phone set.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.send')
  if (deny) return deny

  const userId = (session!.user as any).id as string

  // Fetch agent's phone from profile
  const agent = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, phone: true },
  })

  if (!agent?.phone) {
    return NextResponse.json(
      { error: 'Your profile must have a phone number set before you can make calls. Go to Settings → Profile.' },
      { status: 422 },
    )
  }

  const body = await req.json()
  const parsed = InitiateCallSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { customerPhone, propertyId } = parsed.data
  const conferenceName = generateConferenceName()

  // Dial both legs
  const { agentCallSid, customerCallSid } = await makeConferenceCall(
    agent.phone,
    customerPhone,
    conferenceName,
  )

  // Persist to DB
  const activeCall = await (prisma as any).activeCall.create({
    data: {
      conferenceName,
      agentCallSid,
      customerCallSid,
      customerPhone,
      agentUserId: userId,
      ...(propertyId ? { propertyId } : {}),
      status: 'INITIATING',
    },
  })

  return NextResponse.json({ success: true, data: activeCall }, { status: 201 })
}

/**
 * GET /api/calls
 * List all non-completed active calls (for supervisor dashboard).
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const calls = await (prisma as any).activeCall.findMany({
    where: {
      status: { not: 'COMPLETED' },
    },
    include: {
      agent: { select: { id: true, name: true, phone: true } },
      property: { select: { id: true, streetAddress: true, city: true, propertyStatus: true } },
    },
    orderBy: { startedAt: 'desc' },
  })

  return NextResponse.json({ data: calls })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/calls/route.ts
git commit -m "feat(gap5): add POST/GET /api/calls route"
```

---

## Task 6: Coach (whisper / barge) and hangup routes

**Files:**
- Create: `apps/web/src/app/api/calls/[id]/coach/route.ts`
- Create: `apps/web/src/app/api/calls/[id]/hangup/route.ts`

- [ ] **Step 1: Create coach route**

```typescript
// apps/web/src/app/api/calls/[id]/coach/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { addWhisperParticipant, addBargeParticipant } from '@/lib/twilio-calls'
import { requirePermission } from '@/lib/auth-utils'

const CoachSchema = z.object({
  mode: z.enum(['WHISPER', 'BARGE']),
})

/**
 * POST /api/calls/[id]/coach
 * Join a live call as supervisor in whisper (coach) or barge (full participant) mode.
 * Supervisor must have User.phone set.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.view')
  if (deny) return deny

  const supervisorId = (session!.user as any).id as string
  const { id } = await params

  const supervisor = await prisma.user.findUnique({
    where: { id: supervisorId },
    select: { phone: true, name: true },
  })

  if (!supervisor?.phone) {
    return NextResponse.json(
      { error: 'Your profile must have a phone number set to join calls. Go to Settings → Profile.' },
      { status: 422 },
    )
  }

  const body = await req.json()
  const parsed = CoachSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { mode } = parsed.data

  const activeCall = await (prisma as any).activeCall.findUnique({ where: { id } })
  if (!activeCall) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }
  if (activeCall.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Call has already ended' }, { status: 409 })
  }
  if (!activeCall.conferenceId) {
    return NextResponse.json(
      { error: 'Conference not yet active. Wait a moment and retry.' },
      { status: 409 },
    )
  }

  let supervisorCallSid: string

  if (mode === 'WHISPER') {
    if (!activeCall.agentCallSid) {
      return NextResponse.json({ error: 'Agent call SID not available yet' }, { status: 409 })
    }
    supervisorCallSid = await addWhisperParticipant(
      activeCall.conferenceId,
      supervisor.phone,
      activeCall.agentCallSid,
    )
  } else {
    supervisorCallSid = await addBargeParticipant(
      activeCall.conferenceId,
      supervisor.phone,
    )
  }

  await (prisma as any).activeCall.update({
    where: { id },
    data: { supervisorCallSid, supervisorMode: mode },
  })

  return NextResponse.json({ success: true, supervisorCallSid, mode })
}
```

- [ ] **Step 2: Create hangup route**

```typescript
// apps/web/src/app/api/calls/[id]/hangup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { hangupCall } from '@/lib/twilio-calls'
import { requirePermission } from '@/lib/auth-utils'

/**
 * POST /api/calls/[id]/hangup
 * Terminate a call by hanging up the agent's leg (which ends the conference).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'comms.send')
  if (deny) return deny

  const { id } = await params

  const activeCall = await (prisma as any).activeCall.findUnique({ where: { id } })
  if (!activeCall) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }
  if (activeCall.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Call already ended' }, { status: 409 })
  }

  // Hang up agent's leg — this ends the conference for everyone
  if (activeCall.agentCallSid) {
    await hangupCall(activeCall.agentCallSid)
  }

  // Optimistically mark as completed (webhook will also fire)
  await (prisma as any).activeCall.update({
    where: { id },
    data: { status: 'COMPLETED', endedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add \
  apps/web/src/app/api/calls/[id]/coach/route.ts \
  apps/web/src/app/api/calls/[id]/hangup/route.ts
git commit -m "feat(gap5): add coach (whisper/barge) and hangup API routes"
```

---

## Task 7: Supervisor UI — ActiveCallsPanel + /calls page

**Files:**
- Create: `apps/web/src/components/calls/ActiveCallsPanel.tsx`
- Create: `apps/web/src/app/(app)/calls/page.tsx`

- [ ] **Step 1: Create `ActiveCallsPanel.tsx`**

```typescript
// apps/web/src/components/calls/ActiveCallsPanel.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Phone, Mic, MicOff, PhoneOff, RefreshCw } from 'lucide-react'

interface ActiveCall {
  id: string
  conferenceName: string
  conferenceId: string | null
  status: string
  supervisorMode: string | null
  customerPhone: string | null
  startedAt: string
  agent: { id: string; name: string; phone: string | null } | null
  property: { id: string; streetAddress: string; city: string | null; propertyStatus: string } | null
}

function elapsedSince(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    INITIATING: 'bg-yellow-100 text-yellow-700',
    RINGING: 'bg-blue-100 text-blue-700',
    ACTIVE: 'bg-green-100 text-green-700',
    COMPLETED: 'bg-gray-100 text-gray-500',
  }
  return map[status] ?? 'bg-gray-100 text-gray-500'
}

export function ActiveCallsPanel() {
  const [calls, setCalls] = useState<ActiveCall[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0) // ticks to force re-render for timer

  const fetchCalls = useCallback(async () => {
    try {
      const res = await fetch('/api/calls')
      if (!res.ok) throw new Error('Failed to fetch calls')
      const json = await res.json()
      setCalls(json.data ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading calls')
    } finally {
      setLoading(false)
    }
  }, [])

  // Poll every 5 seconds
  useEffect(() => {
    fetchCalls()
    const interval = setInterval(fetchCalls, 5000)
    return () => clearInterval(interval)
  }, [fetchCalls])

  // Tick every second to update elapsed timers
  useEffect(() => {
    const tick = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  async function joinCall(callId: string, mode: 'WHISPER' | 'BARGE') {
    setActing(callId)
    setError(null)
    try {
      const res = await fetch(`/api/calls/${callId}/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to join call')
      await fetchCalls()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error joining call')
    } finally {
      setActing(null)
    }
  }

  async function hangup(callId: string) {
    if (!confirm('End this call for all parties?')) return
    setActing(callId)
    setError(null)
    try {
      const res = await fetch(`/api/calls/${callId}/hangup`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to end call')
      setCalls((prev) => prev.filter((c) => c.id !== callId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error ending call')
    } finally {
      setActing(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading active calls…
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-green-600" />
          <span className="text-sm font-semibold text-gray-800">
            Active Calls ({calls.length})
          </span>
          <span className="text-xs text-gray-400">— refreshes every 5s</span>
        </div>
        <button
          onClick={fetchCalls}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-3 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {calls.length === 0 ? (
        <div className="text-sm text-gray-500 bg-gray-50 rounded-xl px-5 py-8 text-center">
          No active calls right now.
          <br />
          <span className="text-xs text-gray-400 mt-1 block">
            Calls appear here when agents initiate outbound conference calls.
          </span>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left">Agent</th>
                <th className="px-4 py-2.5 text-left">Customer</th>
                <th className="px-4 py-2.5 text-left">Property</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Duration</th>
                <th className="px-4 py-2.5 text-left">Supervisor</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {call.agent?.name ?? '—'}
                    {call.agent?.phone && (
                      <span className="block text-xs text-gray-400 font-mono">{call.agent.phone}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    {call.customerPhone ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {call.property
                      ? `${call.property.streetAddress}${call.property.city ? `, ${call.property.city}` : ''}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge(call.status)}`}>
                      {call.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 tabular-nums">
                    {elapsedSince(call.startedAt)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {call.supervisorMode ? (
                      <span className={`font-semibold ${call.supervisorMode === 'WHISPER' ? 'text-purple-700' : 'text-orange-700'}`}>
                        {call.supervisorMode}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {/* Whisper: only show if not already coaching */}
                      {call.status === 'ACTIVE' && !call.supervisorMode && (
                        <>
                          <button
                            onClick={() => joinCall(call.id, 'WHISPER')}
                            disabled={acting === call.id || !call.conferenceId}
                            title="Whisper (speak to agent only)"
                            className="flex items-center gap-1 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 px-2.5 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                          >
                            <Mic className="w-3.5 h-3.5" />
                            Whisper
                          </button>
                          <button
                            onClick={() => joinCall(call.id, 'BARGE')}
                            disabled={acting === call.id || !call.conferenceId}
                            title="Barge (all parties hear each other)"
                            className="flex items-center gap-1 text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 px-2.5 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                          >
                            <MicOff className="w-3.5 h-3.5" />
                            Barge
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => hangup(call.id)}
                        disabled={acting === call.id}
                        title="End call"
                        className="flex items-center gap-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 px-2.5 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                      >
                        <PhoneOff className="w-3.5 h-3.5" />
                        End
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-4 text-xs text-gray-400 space-y-1">
        <p><strong className="text-gray-500">Whisper:</strong> You hear the agent + customer. Only the agent hears you. Customer is unaware.</p>
        <p><strong className="text-gray-500">Barge:</strong> All three parties hear each other.</p>
        <p><strong className="text-gray-500">Requirement:</strong> Your user profile must have a phone number set (Settings → Profile) to join calls.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the calls page**

```typescript
// apps/web/src/app/(app)/calls/page.tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ActiveCallsPanel } from '@/components/calls/ActiveCallsPanel'

export default async function CallsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Live Calls</h1>
      <p className="text-sm text-gray-500 mb-5">
        Monitor active calls and join as coach (whisper) or full participant (barge).
      </p>
      <ActiveCallsPanel />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add \
  apps/web/src/components/calls/ActiveCallsPanel.tsx \
  "apps/web/src/app/(app)/calls/page.tsx"
git commit -m "feat(gap5): add ActiveCallsPanel and supervisor /calls page"
```

---

## Task 8: Sidebar + Settings wiring

**Files:**
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Modify: `apps/web/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Add "Calls" to Sidebar Tools section**

In `apps/web/src/components/layout/Sidebar.tsx`, find the Tools section items array:

```typescript
{
  label: 'Tools',
  items: [
    { label: 'Campaigns', href: '/campaigns' },
    { label: 'Scheduled SMS', href: '/scheduled-sms' },
    { label: 'Calendar', href: '/calendar' },
    { label: 'Tasks', href: '/tasks' },
    { label: 'Activity', href: '/activity' },
    { label: 'List Stacking', href: '/list-stacking' },
  ],
},
```

Add `{ label: 'Live Calls', href: '/calls' }` after Scheduled SMS:

```typescript
{
  label: 'Tools',
  items: [
    { label: 'Campaigns', href: '/campaigns' },
    { label: 'Scheduled SMS', href: '/scheduled-sms' },
    { label: 'Live Calls', href: '/calls' },
    { label: 'Calendar', href: '/calendar' },
    { label: 'Tasks', href: '/tasks' },
    { label: 'Activity', href: '/activity' },
    { label: 'List Stacking', href: '/list-stacking' },
  ],
},
```

- [ ] **Step 2: Add Voice Call section to Twilio settings tab**

In `apps/web/src/app/(app)/settings/page.tsx`, find the `{tab === 'twilio' && (` block. After the existing "Inbound Webhook URL" blue box (closing `</div>`), add a second blue box for voice:

```tsx
{tab === 'twilio' && (
  <div className="max-w-xl space-y-4">
    {/* … existing Twilio config card … */}
    {/* … existing Inbound Webhook URL box … */}

    {/* Voice / Conference Webhook */}
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
      <strong>Voice Call Status Webhook URL:</strong>
      <code className="block mt-1 text-xs bg-blue-100 px-3 py-2 rounded font-mono">
        {`${process.env.TWILIO_TWIML_HOST ?? process.env.NEXTAUTH_URL ?? 'https://your-domain.com'}/api/webhooks/twilio-call`}
      </code>
      <p className="mt-2 text-xs text-blue-600">
        Set <code className="bg-blue-100 px-1 rounded">TWILIO_TWIML_HOST</code> to your
        public domain (or ngrok URL in dev). Configure this as the Status Callback URL
        on your Twilio calls to enable the live call supervisor dashboard.
      </p>
    </div>

    {/* TwiML Host indicator */}
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">Voice / Conference Calls</h3>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between items-center py-2 border-b border-gray-50">
          <span className="text-gray-500">TwiML Host</span>
          <span className="font-mono text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded">
            {process.env.TWILIO_TWIML_HOST
              ? process.env.TWILIO_TWIML_HOST
              : <span className="text-amber-600">Not configured — set TWILIO_TWIML_HOST</span>}
          </span>
        </div>
        <div className="flex justify-between items-center py-2">
          <span className="text-gray-500">TwiML Endpoint</span>
          <span className="font-mono text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded">
            /api/calls/twiml
          </span>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-4">
        To make conference calls, agents need their phone number set in{' '}
        <strong>Settings → Profile</strong>. Supervisors joining calls also need their phone number set.
      </p>
    </div>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add \
  apps/web/src/components/layout/Sidebar.tsx \
  "apps/web/src/app/(app)/settings/page.tsx"
git commit -m "feat(gap5): add Live Calls to sidebar and voice settings to Twilio tab"
```

---

## Spec Coverage Check

| Requirement | Task |
|------------|------|
| Supervisor sees all active calls | Task 7 — `ActiveCallsPanel` polls `GET /api/calls` |
| Whisper mode (agent hears supervisor, customer doesn't) | Task 6 — `POST /api/calls/:id/coach { mode: 'WHISPER' }` → Twilio `coaching: true` |
| Barge mode (all three hear each other) | Task 6 — `POST /api/calls/:id/coach { mode: 'BARGE' }` → regular participant |
| Call state persisted | Task 1 — `ActiveCall` model; Tasks 4+5 — status webhook updates it |
| TwiML conference entry | Task 3 — `/api/calls/twiml` returns `<Conference>` XML |
| Outbound call initiation | Task 5 — `POST /api/calls` dials both legs |
| Hangup | Task 6 — `POST /api/calls/:id/hangup` calls `hangupCall(agentCallSid)` |
| Mock mode when Twilio not configured | Task 2 — `getClient()` returns null → log mode |
| Supervisor phone from User.phone | Tasks 6, 7 — fetched from DB, not hardcoded |
| Nav entry | Task 8 — `Live Calls` in Sidebar Tools section |
| Settings documentation | Task 8 — `TWILIO_TWIML_HOST` shown in Twilio tab |
| Schema migration note | Task 1 — db:push command documented |

> **Note:** This plan does NOT require `db:push` to be run before writing the code. All Prisma queries use `(prisma as any).activeCall` until the migration runs. Once the user runs the db:push command from Task 1 Step 5, the typed client will be regenerated and the feature will be fully functional.
