# Phase 7 — AI Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Anthropic Claude into the CRM to provide per-property AI lead summarization, hot lead scoring (0–100 with `isHot` flag), and a stateless conversational chat panel with full property context.

**Architecture:** All AI calls flow through a thin `lib/ai.ts` wrapper (`generateText(prompt, system?)`). The `AiEngine` enum and `AiLog` model already exist in the schema for audit trails. One new nullable column (`aiSummary: String?`) is added to `Property` for cached display. `Property.isHot` (existing boolean) is updated by the scorer. Chat is stateless — the client sends full conversation history each round-trip; no session table needed. Tests mock `@/lib/ai` (not the raw SDK) for all lib helpers.

**Tech Stack:** Next.js 15 App Router, Prisma 7, `@anthropic-ai/sdk` (`claude-3-5-haiku-20241022`), Zod, Tailwind CSS 4, `lucide-react`, Vitest

---

## Actual Schema Field Names (MEMORIZE THESE)

```
Property (existing):  streetAddress, city, state, zip, leadStatus, propertyStatus
                      activeLeadStage: ActiveLeadStage?, exitStrategy: ExitStrategy?
                      isHot: Boolean @default(false)   ← ALREADY EXISTS, used by scorer
                      askingPrice: Decimal?, offerPrice: Decimal?, arv: Decimal?
                      aiLogs: AiLog[]                  ← relation ALREADY EXISTS

Property (new):       aiSummary: String?               ← ADDED in Task 1

AiLog (existing):     id, propertyId?, engine: AiEngine, input: Json, output: Json
                      tokens: Int?, latencyMs: Int?, createdAt: DateTime

AiEngine enum:        TEXT_CONVERSATIONAL | LEAD_SUMMARIZATION
                      HOT_LEAD_DETECTION | VOICE_CONVERSATIONAL
```

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/database/prisma/schema.prisma` | MODIFY | Add `aiSummary String?` to Property |
| `apps/web/.env.local` | CREATE | Add `ANTHROPIC_API_KEY=` |
| `apps/web/package.json` | MODIFY | Add `@anthropic-ai/sdk` to dependencies |
| `apps/web/src/lib/ai.ts` | CREATE | Lazy Anthropic singleton; `generateText(prompt, system?)` |
| `apps/web/src/lib/__tests__/ai.test.ts` | CREATE | 2 tests (happy path + system prompt forwarded) |
| `apps/web/src/lib/lead-summary.ts` | CREATE | `generateLeadSummary(propertyId)` — builds context prompt, writes AiLog |
| `apps/web/src/lib/__tests__/lead-summary.test.ts` | CREATE | 2 tests |
| `apps/web/src/app/api/properties/[id]/summarize/route.ts` | CREATE | POST — generate + save to Property.aiSummary |
| `apps/web/src/lib/hot-lead.ts` | CREATE | `scoreHotLead(propertyId)` → 0–100 int, writes AiLog |
| `apps/web/src/lib/__tests__/hot-lead.test.ts` | CREATE | 2 tests |
| `apps/web/src/app/api/properties/[id]/score/route.ts` | CREATE | POST — score + update Property.isHot |
| `apps/web/src/app/api/properties/[id]/chat/route.ts` | CREATE | POST — stateless chat with property system prompt |
| `apps/web/src/components/ai/PropertyAIPanel.tsx` | CREATE | Summary card + score bar + Regenerate/Score buttons |
| `apps/web/src/components/ai/PropertyChatPanel.tsx` | CREATE | Collapsible chat UI; client holds message history |
| `apps/web/src/app/(app)/leads/dts/[id]/page.tsx` | MODIFY | Add PropertyAIPanel + PropertyChatPanel to right column |
| `apps/web/src/app/(app)/leads/dta/[id]/page.tsx` | MODIFY | Add PropertyAIPanel + PropertyChatPanel to right column |

---

### Task 1: Schema Migration + SDK Install + Env

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `apps/web/.env.local`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add `aiSummary` to Property model**

Read `packages/database/prisma/schema.prisma` and locate the `model Property` block. It ends at line ~293. Add the new field **before** the closing `}`, between `campaignName` and `tags`:

```prisma
  aiSummary         String?
```

The block around that area should now read:
```prisma
  source            String?
  campaignName      String?
  aiSummary         String?
  tags              String[]
```

- [ ] **Step 2: Run Prisma migration**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/packages/database" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd prisma migrate dev --name add-ai-summary 2>&1 | tail -15
```

Expected: `The following migration(s) have been created and applied ... add-ai-summary` and `✔ Generated Prisma Client`.

If `DATABASE_URL` is not set, run `prisma generate` instead to update types only:
```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/packages/database" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd prisma generate 2>&1 | tail -5
```

- [ ] **Step 3: Create `apps/web/.env.local`**

```bash
echo "ANTHROPIC_API_KEY=sk-ant-REPLACE_WITH_YOUR_KEY" > "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web/.env.local"
```

The developer must replace `sk-ant-REPLACE_WITH_YOUR_KEY` with their real Anthropic API key from https://console.anthropic.com.

- [ ] **Step 4: Add `@anthropic-ai/sdk` to `apps/web/package.json`**

In `apps/web/package.json`, add to `"dependencies"`:
```json
"@anthropic-ai/sdk": "^0.36.0",
```

- [ ] **Step 5: Install the package**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && PATH=/c/node-x64:$PATH pnpm --filter @crm/web install 2>&1 | tail -5
```

If pnpm fails with a corepack error, fall back to:
```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npm.cmd install 2>&1 | tail -5
```

Expected: `node_modules/@anthropic-ai/sdk` directory exists.

- [ ] **Step 6: Verify package is importable**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/node.exe -e "require('@anthropic-ai/sdk'); console.log('OK')" 2>&1
```

Expected: `OK`

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add packages/database/prisma apps/web/package.json && git commit -m "feat: add aiSummary field to Property + install @anthropic-ai/sdk"
```

---

### Task 2: AI Client Lib + Tests

**Files:**
- Create: `apps/web/src/lib/ai.ts`
- Create: `apps/web/src/lib/__tests__/ai.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/__tests__/ai.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}))

import { generateText } from '../ai'

describe('generateText', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns text content from the AI response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello from AI' }],
    })
    const result = await generateText('What is this lead about?')
    expect(result).toBe('Hello from AI')
  })

  it('passes system prompt when provided', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
    })
    await generateText('user message', 'You are a CRM assistant.')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'You are a CRM assistant.' })
    )
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run src/lib/__tests__/ai.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../ai'`

- [ ] **Step 3: Create `apps/web/src/lib/ai.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

export async function generateText(prompt: string, system?: string): Promise<string> {
  const msg = await getClient().messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1024,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }],
  })
  const block = msg.content[0]
  if (block.type !== 'text') throw new Error('Unexpected content type from AI')
  return block.text
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run src/lib/__tests__/ai.test.ts 2>&1 | tail -10
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/lib/ai.ts apps/web/src/lib/__tests__/ai.test.ts && git commit -m "feat: add AI client wrapper with generateText helper"
```

---

### Task 3: Lead Summary Lib + Tests

**Files:**
- Create: `apps/web/src/lib/lead-summary.ts`
- Create: `apps/web/src/lib/__tests__/lead-summary.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/__tests__/lead-summary.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    property: { findUniqueOrThrow: vi.fn() },
    aiLog: { create: vi.fn() },
  },
}))

vi.mock('@/lib/ai', () => ({
  generateText: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai'
import { generateLeadSummary } from '../lead-summary'

describe('generateLeadSummary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls generateText with property context and returns the summary', async () => {
    vi.mocked(prisma.property.findUniqueOrThrow).mockResolvedValue({
      id: 'p1',
      streetAddress: '123 Main St',
      city: 'Dallas',
      state: 'TX',
      leadStatus: 'ACTIVE',
      activeLeadStage: 'OFFER_MADE',
      exitStrategy: 'WHOLESALE',
      contacts: [
        { contact: { firstName: 'John', lastName: 'Smith' } },
      ],
      conversations: [
        { messages: [{ channel: 'SMS', direction: 'INBOUND', body: 'I want to sell fast.' }] },
      ],
    } as any)
    vi.mocked(generateText).mockResolvedValue('Motivated seller at offer stage — follow up today.')

    const result = await generateLeadSummary('p1')

    expect(result).toBe('Motivated seller at offer stage — follow up today.')
    expect(generateText).toHaveBeenCalledWith(
      expect.stringContaining('123 Main St'),
    )
  })

  it('persists an AiLog record with engine LEAD_SUMMARIZATION', async () => {
    vi.mocked(prisma.property.findUniqueOrThrow).mockResolvedValue({
      id: 'p2',
      streetAddress: null,
      city: null,
      state: null,
      leadStatus: 'ACTIVE',
      activeLeadStage: null,
      exitStrategy: null,
      contacts: [],
      conversations: [],
    } as any)
    vi.mocked(generateText).mockResolvedValue('No communications yet.')
    vi.mocked(prisma.aiLog.create).mockResolvedValue({} as any)

    await generateLeadSummary('p2')

    expect(prisma.aiLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ engine: 'LEAD_SUMMARIZATION', propertyId: 'p2' }),
      })
    )
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run src/lib/__tests__/lead-summary.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../lead-summary'`

- [ ] **Step 3: Create `apps/web/src/lib/lead-summary.ts`**

```typescript
import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai'

export async function generateLeadSummary(propertyId: string): Promise<string> {
  const property = await prisma.property.findUniqueOrThrow({
    where: { id: propertyId },
    include: {
      contacts: {
        where: { isPrimary: true },
        include: { contact: { select: { firstName: true, lastName: true } } },
        take: 3,
      },
      conversations: {
        include: {
          messages: { orderBy: { createdAt: 'asc' }, take: 20 },
        },
        take: 5,
      },
    },
  })

  const contactNames = property.contacts
    .map((c) => `${c.contact.firstName} ${c.contact.lastName ?? ''}`.trim())
    .filter(Boolean)
    .join(', ')

  const messages = property.conversations.flatMap((conv) => conv.messages).slice(0, 20)
  const msgText =
    messages.length > 0
      ? messages
          .map((m) => `[${m.channel}/${m.direction}]: ${m.body ?? '(no body)'}`)
          .join('\n')
      : 'No communications yet.'

  const prompt = `You are a real estate CRM assistant. Summarize this lead in 2–3 sentences.

Property: ${property.streetAddress ?? 'No address'}, ${property.city ?? ''}, ${property.state ?? ''}
Status: ${property.leadStatus} | Stage: ${property.activeLeadStage ?? 'N/A'}
Exit Strategy: ${property.exitStrategy ?? 'Unknown'}
Contacts: ${contactNames || 'None'}

Recent Communications:
${msgText}

Write a concise summary of this lead's current situation and the single most important next action.`

  const summary = await generateText(prompt)

  await prisma.aiLog.create({
    data: {
      propertyId,
      engine: 'LEAD_SUMMARIZATION',
      input: {
        propertyId,
        stage: property.activeLeadStage,
        messageCount: messages.length,
      },
      output: { summary },
    },
  })

  return summary
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run src/lib/__tests__/lead-summary.test.ts 2>&1 | tail -10
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/lib/lead-summary.ts apps/web/src/lib/__tests__/lead-summary.test.ts && git commit -m "feat: add lead summarization AI helper with tests"
```

---

### Task 4: Lead Summary Route Handler

**Files:**
- Create: `apps/web/src/app/api/properties/[id]/summarize/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { generateLeadSummary } from '@/lib/lead-summary'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const summary = await generateLeadSummary(id)

    await prisma.property.update({
      where: { id },
      data: { aiSummary: summary },
    })

    return NextResponse.json({ summary })
  } catch (err) {
    console.error('[summarize] error:', err)
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: Zero errors.

If you see `Property.aiSummary does not exist`, the Prisma client types are stale — run:
```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/packages/database" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd prisma generate 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/app/api/properties && git commit -m "feat: add POST /api/properties/[id]/summarize route"
```

---

### Task 5: Hot Lead Scoring Lib + Tests

**Files:**
- Create: `apps/web/src/lib/hot-lead.ts`
- Create: `apps/web/src/lib/__tests__/hot-lead.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/__tests__/hot-lead.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    property: { findUniqueOrThrow: vi.fn() },
    aiLog: { create: vi.fn() },
  },
}))

vi.mock('@/lib/ai', () => ({
  generateText: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai'
import { scoreHotLead } from '../hot-lead'

describe('scoreHotLead', () => {
  beforeEach(() => vi.clearAllMocks())

  it('parses numeric score from AI response', async () => {
    vi.mocked(prisma.property.findUniqueOrThrow).mockResolvedValue({
      id: 'p1',
      activeLeadStage: 'OFFER_MADE',
      conversations: [
        { messages: [{ direction: 'INBOUND', body: 'I need to sell ASAP, very motivated.' }] },
      ],
    } as any)
    vi.mocked(generateText).mockResolvedValue('82')
    vi.mocked(prisma.aiLog.create).mockResolvedValue({} as any)

    const score = await scoreHotLead('p1')

    expect(score).toBe(82)
    expect(prisma.aiLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ engine: 'HOT_LEAD_DETECTION' }),
      })
    )
  })

  it('defaults to 50 when AI returns non-numeric text', async () => {
    vi.mocked(prisma.property.findUniqueOrThrow).mockResolvedValue({
      id: 'p2',
      activeLeadStage: null,
      conversations: [],
    } as any)
    vi.mocked(generateText).mockResolvedValue('I cannot determine the score.')
    vi.mocked(prisma.aiLog.create).mockResolvedValue({} as any)

    const score = await scoreHotLead('p2')

    expect(score).toBe(50)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run src/lib/__tests__/hot-lead.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../hot-lead'`

- [ ] **Step 3: Create `apps/web/src/lib/hot-lead.ts`**

```typescript
import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai'

export async function scoreHotLead(propertyId: string): Promise<number> {
  const property = await prisma.property.findUniqueOrThrow({
    where: { id: propertyId },
    include: {
      conversations: {
        include: {
          messages: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
        take: 3,
      },
    },
  })

  const messages = property.conversations.flatMap((c) => c.messages).slice(0, 10)
  const msgText =
    messages.length > 0
      ? messages.map((m) => `[${m.direction}]: ${m.body ?? '(no body)'}`).join('\n')
      : 'No messages yet.'

  const prompt = `You are a real estate investment analyst. Score this lead from 0 to 100 based on how likely it is to close soon.

Stage: ${property.activeLeadStage ?? 'Unknown'}
Recent messages:
${msgText}

Scoring guide:
- 80–100: Highly motivated seller, late stage, strong engagement
- 60–79: Active engagement, mid to late stage
- 40–59: Some interest, early to mid stage
- 0–39: Cold, no engagement, or dead end

Respond with ONLY a single integer between 0 and 100. No text, no punctuation.`

  const text = await generateText(prompt)
  const parsed = parseInt(text.trim(), 10)
  const score = isNaN(parsed) ? 50 : Math.max(0, Math.min(100, parsed))

  await prisma.aiLog.create({
    data: {
      propertyId,
      engine: 'HOT_LEAD_DETECTION',
      input: {
        propertyId,
        stage: property.activeLeadStage,
        messageCount: messages.length,
      },
      output: { score },
    },
  })

  return score
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run src/lib/__tests__/hot-lead.test.ts 2>&1 | tail -10
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/lib/hot-lead.ts apps/web/src/lib/__tests__/hot-lead.test.ts && git commit -m "feat: add hot lead scoring AI helper with tests"
```

---

### Task 6: Hot Lead Scoring Route Handler

**Files:**
- Create: `apps/web/src/app/api/properties/[id]/score/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { scoreHotLead } from '@/lib/hot-lead'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const score = await scoreHotLead(id)
    const isHot = score >= 60

    await prisma.property.update({
      where: { id },
      data: { isHot },
    })

    return NextResponse.json({ score, isHot })
  } catch (err) {
    console.error('[score] error:', err)
    return NextResponse.json({ error: 'AI scoring failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/app/api/properties && git commit -m "feat: add POST /api/properties/[id]/score route for hot lead detection"
```

---

### Task 7: Property Context Chat Route Handler

**Files:**
- Create: `apps/web/src/app/api/properties/[id]/chat/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai'

const ChatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .max(20)
    .default([]),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = ChatSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { message, history } = parsed.data

  const property = await prisma.property.findUniqueOrThrow({
    where: { id },
    include: {
      market: { select: { name: true } },
      contacts: {
        where: { isPrimary: true },
        include: {
          contact: { select: { firstName: true, lastName: true, phone: true, email: true } },
        },
        take: 3,
      },
    },
  })

  const contactList = property.contacts
    .map((c) =>
      `${c.contact.firstName} ${c.contact.lastName ?? ''} (${c.contact.phone ?? 'no phone'})`.trim()
    )
    .join(', ')

  const system = `You are an AI assistant embedded in a real estate investment CRM. You have full context on the following lead:

Address: ${property.streetAddress ?? 'No address'}, ${property.city ?? ''}, ${property.state ?? ''} ${property.zip ?? ''}
Market: ${property.market.name}
Status: ${property.leadStatus} | Stage: ${property.activeLeadStage ?? 'N/A'}
Exit Strategy: ${property.exitStrategy ?? 'Not set'}
Asking Price: ${property.askingPrice ? `$${Number(property.askingPrice).toLocaleString()}` : 'Not set'}
Offer Price: ${property.offerPrice ? `$${Number(property.offerPrice).toLocaleString()}` : 'Not set'}
ARV: ${property.arv ? `$${Number(property.arv).toLocaleString()}` : 'Not set'}
Repair Estimate: ${property.repairEstimate ? `$${Number(property.repairEstimate).toLocaleString()}` : 'Not set'}
Hot Lead: ${property.isHot ? 'Yes' : 'No'}
Contacts: ${contactList || 'None'}

Answer questions about this lead concisely. If asked about something not in the context above, say so honestly. Keep replies under 3 sentences unless the user asks for more detail.`

  // Build multi-turn conversation as a single user message (simple stateless approach)
  const conversationPrompt = [
    ...history.map((h) => `${h.role === 'user' ? 'Human' : 'Assistant'}: ${h.content}`),
    `Human: ${message}`,
    'Assistant:',
  ].join('\n\n')

  try {
    const reply = await generateText(conversationPrompt, system)

    await prisma.aiLog.create({
      data: {
        propertyId: id,
        engine: 'TEXT_CONVERSATIONAL',
        input: { message, historyLength: history.length },
        output: { reply },
      },
    })

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[chat] error:', err)
    return NextResponse.json({ error: 'AI response failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/app/api/properties && git commit -m "feat: add POST /api/properties/[id]/chat route for property context chat"
```

---

### Task 8: PropertyAIPanel Component

**Files:**
- Create: `apps/web/src/components/ai/PropertyAIPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Flame } from 'lucide-react'

interface Props {
  propertyId: string
  initialSummary: string | null
  initialIsHot: boolean
}

export function PropertyAIPanel({ propertyId, initialSummary, initialIsHot }: Props) {
  const router = useRouter()
  const [summary, setSummary] = useState(initialSummary)
  const [isHot, setIsHot] = useState(initialIsHot)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [scoringLead, setScoringLead] = useState(false)
  const [scoreResult, setScoreResult] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function handleSummarize() {
    setGeneratingSummary(true)
    setError('')
    try {
      const res = await fetch(`/api/properties/${propertyId}/summarize`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setSummary(data.summary)
      router.refresh()
    } catch {
      setError('Failed to generate summary. Check your API key.')
    } finally {
      setGeneratingSummary(false)
    }
  }

  async function handleScore() {
    setScoringLead(true)
    setError('')
    try {
      const res = await fetch(`/api/properties/${propertyId}/score`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setScoreResult(data.score)
      setIsHot(data.isHot)
      router.refresh()
    } catch {
      setError('Failed to score lead. Check your API key.')
    } finally {
      setScoringLead(false)
    }
  }

  const scoreColor =
    scoreResult !== null
      ? scoreResult >= 75
        ? 'bg-red-500'
        : scoreResult >= 50
        ? 'bg-orange-400'
        : 'bg-blue-300'
      : 'bg-gray-200'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <h3 className="text-sm font-semibold text-gray-800">AI Insights</h3>
        </div>
        {isHot && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5">
            <Flame className="w-3 h-3" />
            Hot Lead
          </span>
        )}
      </div>

      {/* Lead Summary */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Lead Summary</p>
          <button
            onClick={handleSummarize}
            disabled={generatingSummary}
            className="flex items-center gap-1 text-[11px] font-medium text-purple-600 hover:text-purple-800 disabled:opacity-50"
          >
            {generatingSummary ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {generatingSummary ? 'Generating…' : summary ? 'Regenerate' : 'Generate'}
          </button>
        </div>
        {summary ? (
          <p className="text-[12px] text-gray-600 leading-relaxed">{summary}</p>
        ) : (
          <p className="text-[12px] text-gray-400 italic">
            Click Generate to create an AI summary of this lead.
          </p>
        )}
      </div>

      {/* Hot Lead Score */}
      <div className="space-y-1.5 pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Hot Lead Score</p>
          <button
            onClick={handleScore}
            disabled={scoringLead}
            className="flex items-center gap-1 text-[11px] font-medium text-orange-600 hover:text-orange-800 disabled:opacity-50"
          >
            {scoringLead ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flame className="w-3 h-3" />}
            {scoringLead ? 'Scoring…' : 'Score Lead'}
          </button>
        </div>
        {scoreResult !== null ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${scoreColor}`}
                style={{ width: `${scoreResult}%` }}
              />
            </div>
            <span className="text-[12px] font-bold text-gray-700 w-8 text-right">{scoreResult}</span>
          </div>
        ) : (
          <p className="text-[12px] text-gray-400 italic">
            Score this lead to see its likelihood to close (0–100).
          </p>
        )}
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}
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
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/components/ai/PropertyAIPanel.tsx && git commit -m "feat: add PropertyAIPanel component (summary + hot lead score)"
```

---

### Task 9: PropertyChatPanel Component

**Files:**
- Create: `apps/web/src/components/ai/PropertyChatPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, Loader2, X } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  propertyId: string
}

export function PropertyChatPanel({ propertyId }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setLoading(true)

    const history = messages
    const withUser: Message[] = [...history, { role: 'user', content: text }]
    setMessages(withUser)

    try {
      const res = await fetch(`/api/properties/${propertyId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })
      const data = await res.json()
      const reply: string = res.ok ? data.reply : 'Sorry, something went wrong. Please try again.'
      setMessages([...withUser, { role: 'assistant', content: reply }])
    } catch {
      setMessages([
        ...withUser,
        { role: 'assistant', content: 'Network error. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-400" />
          Ask AI about this lead
        </span>
        <span className="text-[11px] text-gray-400">Click to open ›</span>
      </button>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-500" />
          <span className="text-[13px] font-semibold text-gray-800">AI Chat</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="h-64 overflow-y-auto p-3 space-y-2 bg-gray-50">
        {messages.length === 0 && (
          <p className="text-[12px] text-gray-400 text-center mt-10">
            Ask me anything about this lead.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-700 rounded-bl-sm'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-xl rounded-bl-sm px-3 py-2 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
              <span className="text-[12px] text-gray-400">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 bg-white"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this lead…"
          disabled={loading}
          className="flex-1 text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-blue-600 text-white rounded-lg p-1.5 hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
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
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add apps/web/src/components/ai/PropertyChatPanel.tsx && git commit -m "feat: add PropertyChatPanel component with stateless multi-turn chat"
```

---

### Task 10: Integrate AI Panels into Lead Detail Pages

**Files:**
- Modify: `apps/web/src/app/(app)/leads/dts/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/dta/[id]/page.tsx`

Both pages have identical structure: `grid grid-cols-3 gap-4` with a 2-column left section and 1-column right section. Add both AI panels at the bottom of the right column.

- [ ] **Step 1: Modify `apps/web/src/app/(app)/leads/dts/[id]/page.tsx`**

Read the file first, then apply these changes:

**Add imports** at the top (after existing imports):
```tsx
import { PropertyAIPanel } from '@/components/ai/PropertyAIPanel'
import { PropertyChatPanel } from '@/components/ai/PropertyChatPanel'
```

**Add panels** at the end of the right column `<div className="space-y-4">`, after the Property Details card:
```tsx
<PropertyAIPanel
  propertyId={lead.id}
  initialSummary={(lead as any).aiSummary ?? null}
  initialIsHot={lead.isHot}
/>
<PropertyChatPanel propertyId={lead.id} />
```

The final right column should look like:
```tsx
<div className="space-y-4">
  <TasksCard propertyId={lead.id} tasks={lead.tasks as any} />
  <div className="bg-white border border-gray-200 rounded-xl p-4">
    <h3 className="text-sm font-semibold text-gray-800 mb-3">Property Details</h3>
    {/* ... existing property details dl ... */}
  </div>
  <PropertyAIPanel
    propertyId={lead.id}
    initialSummary={(lead as any).aiSummary ?? null}
    initialIsHot={lead.isHot}
  />
  <PropertyChatPanel propertyId={lead.id} />
</div>
```

- [ ] **Step 2: Modify `apps/web/src/app/(app)/leads/dta/[id]/page.tsx`**

Apply the same changes as Step 1 but for the DTA detail page. The structure is identical — add the same imports and the same two panels at the bottom of the right column.

**Add imports:**
```tsx
import { PropertyAIPanel } from '@/components/ai/PropertyAIPanel'
import { PropertyChatPanel } from '@/components/ai/PropertyChatPanel'
```

**Add panels** at the end of the right column after the Property Details card:
```tsx
<PropertyAIPanel
  propertyId={lead.id}
  initialSummary={(lead as any).aiSummary ?? null}
  initialIsHot={lead.isHot}
/>
<PropertyChatPanel propertyId={lead.id} />
```

- [ ] **Step 3: TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: Zero errors. If you see `Property.aiSummary does not exist on type`, run `prisma generate` in `packages/database` — the migration was not regenerated. Use `(lead as any).aiSummary` as a cast in the meantime.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git add "apps/web/src/app/(app)/leads" && git commit -m "feat: integrate PropertyAIPanel and PropertyChatPanel into DTS and DTA lead detail pages"
```

---

### Task 11: Build Verification

- [ ] **Step 1: Run all tests**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd vitest run 2>&1 | tail -15
```

Expected: All tests pass (~56 total: 50 from Phase 6 + 2 ai + 2 lead-summary + 2 hot-lead). Zero failures.

Common failure fixes:
- `Cannot find module '@anthropic-ai/sdk'` in ai.test.ts → the mock factory has a typo; check `vi.mock` import path
- `prisma.aiLog is not a function` in lead-summary / hot-lead tests → add `aiLog: { create: vi.fn() }` to the prisma mock

- [ ] **Step 2: Full TypeScript check**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd tsc --noEmit 2>&1
```

Expected: Zero errors. Common fixes:
- `Property.aiSummary does not exist` → run `prisma generate` in `packages/database`
- `Type 'string' is not assignable to AiEngine` → import `AiEngine` from `@crm/database` and use `AiEngine.LEAD_SUMMARIZATION`

- [ ] **Step 3: Production build**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built/apps/web" && PATH=/c/node-x64:$PATH /c/node-x64/npx.cmd next build 2>&1 | tail -30
```

Expected: Build succeeds. Look for `/leads/dts/[id]` and `/leads/dta/[id]` in the route table — both should show `ƒ (Dynamic)`.

If the build fails with `Module not found: @anthropic-ai/sdk` it means the package wasn't installed correctly. Re-run the install step from Task 1.

- [ ] **Step 4: Final commit**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built" && git log --oneline -8
```

Expected output (8 commits from Phase 7):
```
feat: integrate PropertyAIPanel and PropertyChatPanel into DTS and DTA lead detail pages
feat: add PropertyChatPanel component with stateless multi-turn chat
feat: add PropertyAIPanel component (summary + hot lead score)
feat: add POST /api/properties/[id]/chat route for property context chat
feat: add POST /api/properties/[id]/score route for hot lead detection
feat: add hot lead scoring AI helper with tests
feat: add POST /api/properties/[id]/summarize route
feat: add lead summarization AI helper with tests
feat: add AI client wrapper with generateText helper
feat: add aiSummary field to Property + install @anthropic-ai/sdk
```
