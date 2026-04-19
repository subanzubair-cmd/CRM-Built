# Gap 6: Campaign AI Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `campaign.aiEnabled` is true, personalize drip campaign message content using AI before dispatch. Add a UI toggle in the campaign edit form.

**Architecture:** The `Campaign.aiEnabled Boolean @default(false)` field already exists in the Prisma schema. No migration needed. The drip executor lives in `apps/api/src/queues/worker.ts` — it runs in the Express API service. The AI rewrite calls the OpenAI API (using the same `OPENAI_API_KEY` env var used by the web AI panels). The campaign edit UI is in the Next.js web app.

**Tech Stack:** Next.js 15 App Router, Express + BullMQ workers, Prisma, OpenAI SDK, plain Tailwind CSS.

---

## Task 1: AI rewrite helper in API service

**Files:**
- Create: `apps/api/src/lib/ai-rewrite.ts`

- [ ] **Step 1: Create the helper**

```typescript
// apps/api/src/lib/ai-rewrite.ts
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface PropertyContext {
  streetAddress?: string | null
  city?: string | null
  state?: string | null
  source?: string | null
  activeLeadStage?: string | null
}

/**
 * Rewrites a drip campaign message body to personalize it for a specific property.
 * Falls back to original body on error.
 */
export async function rewriteForProperty(
  originalBody: string,
  property: PropertyContext
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return originalBody

  const address = [property.streetAddress, property.city, property.state]
    .filter(Boolean)
    .join(', ') || 'the property'

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a real estate wholesaling assistant. Rewrite the SMS message to personalize it for the given property address. Keep it under 160 characters, natural, and conversational. Return only the rewritten message, no explanation.',
        },
        {
          role: 'user',
          content: `Property: ${address}\nOriginal message: ${originalBody}`,
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    })
    return completion.choices[0]?.message?.content?.trim() ?? originalBody
  } catch (err) {
    console.error('[ai-rewrite] Error:', err)
    return originalBody
  }
}
```

- [ ] **Step 2: Ensure openai package is installed in apps/api**

```bash
cd "C:/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
node "C:/Users/suban/AppData/Local/pnpm/.tools/pnpm/9.0.0/node_modules/pnpm/bin/pnpm.cjs" --filter api add openai
```

If already installed (check `apps/api/package.json`), skip.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/ai-rewrite.ts apps/api/package.json
git commit -m "feat(gap6): add AI message rewrite helper for campaigns"
```

---

## Task 2: Wire AI rewrite into drip executor

**Files:**
- Modify: `apps/api/src/queues/worker.ts` (or `apps/api/src/lib/drip-executor.ts` if it exists)

- [ ] **Step 1: Read the worker**

Read `apps/api/src/queues/worker.ts`. Find where the drip campaign step is dispatched — the section that sends an SMS (creates a Message record with `channel: 'SMS'`).

The step execution logic looks for the current step by `order === enrollment.currentStep` and sends the message. Before creating the Message record, add the AI rewrite if `enrollment.campaign.aiEnabled` is true.

- [ ] **Step 2: Add the rewrite**

In the worker file, add the import:
```typescript
import { rewriteForProperty } from '../lib/ai-rewrite'
```

Find the section that builds the message body. Before creating the Message record, add:
```typescript
let messageBody = step.body
if (enrollment.campaign.aiEnabled && enrollment.property) {
  messageBody = await rewriteForProperty(step.body, {
    streetAddress: enrollment.property.streetAddress,
    city: enrollment.property.city,
    state: enrollment.property.state,
    source: enrollment.property.source,
    activeLeadStage: enrollment.property.activeLeadStage,
  })
}
```

Then use `messageBody` instead of `step.body` when creating the Message record.

NOTE: The worker may need to include `property` in the enrollment query if not already there. Check the existing include for `enrollment.property` — add it if missing:
```typescript
include: {
  campaign: { include: { steps: true } },
  property: { select: { id: true, streetAddress: true, city: true, state: true, source: true, activeLeadStage: true } },
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/queues/worker.ts
git commit -m "feat(gap6): wire AI rewrite into drip campaign executor"
```

---

## Task 3: AI toggle UI in campaign edit form

**Files:**
- Modify: `apps/web/src/components/campaigns/CampaignEditForm.tsx` (or wherever the campaign edit form is)

- [ ] **Step 1: Find the campaign edit form**

Check these files to find where `aiEnabled` should be exposed:
- `apps/web/src/components/campaigns/CampaignEditForm.tsx`
- `apps/web/src/components/campaigns/CampaignForm.tsx`
- `apps/web/src/app/(app)/campaigns/[id]/page.tsx`

Read the form component. Find the form fields (name, description, status, etc.).

- [ ] **Step 2: Add the AI toggle**

In the form, add a toggle for `aiEnabled`. After the existing fields, add:

```tsx
{/* AI Personalization Toggle */}
<div className="flex items-center justify-between py-3 border-t border-gray-100">
  <div>
    <p className="text-sm font-medium text-gray-800">AI Personalization</p>
    <p className="text-xs text-gray-400 mt-0.5">
      Rewrites each message to personalize it for the property before sending
    </p>
  </div>
  <button
    type="button"
    onClick={() => setForm((f) => ({ ...f, aiEnabled: !f.aiEnabled }))}
    className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
      form.aiEnabled ? 'bg-blue-600' : 'bg-gray-200'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${
        form.aiEnabled ? 'translate-x-4' : 'translate-x-0.5'
      }`}
    />
  </button>
</div>
```

Make sure `aiEnabled` is included in the form state and PATCH payload. Add it to:
1. The initial form state: `aiEnabled: campaign.aiEnabled ?? false`
2. The PATCH body: `{ ..., aiEnabled: form.aiEnabled }`

- [ ] **Step 3: Verify PATCH /api/campaigns/[id] handles aiEnabled**

Check `apps/web/src/app/api/campaigns/[id]/route.ts`. In the PATCH handler, make sure `aiEnabled` is in the allowed update fields. If not, add:
```typescript
if (data.aiEnabled !== undefined) updateData.aiEnabled = data.aiEnabled
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/campaigns/ apps/web/src/app/api/campaigns/
git commit -m "feat(gap6): add AI personalization toggle to campaign edit form"
```
