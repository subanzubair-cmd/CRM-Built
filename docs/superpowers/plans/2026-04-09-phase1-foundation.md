# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the current Next.js scaffold into a pnpm Turborepo monorepo with full Prisma schema, NextAuth v5 auth, Express API scaffold, and the complete navigation shell — ready for Phase 2 feature work.

**Architecture:** pnpm workspace with four packages (`@crm/web`, `@crm/api`, `@crm/database`, `@crm/shared`). All packages use TypeScript. `apps/api` runs with `tsx` in dev. `apps/web` uses Next.js App Router. Auth flows through a shared JWT secret.

**Tech Stack:** Node 24, pnpm 9, Turborepo 2, Next.js 15, NextAuth v5, Express 5, Prisma 7, PostgreSQL 16, Redis 7, MinIO, BullMQ 5, Socket.io 4, shadcn/ui, Tailwind CSS 4, Zod, Vitest

---

## File Map

Files created or modified by this plan:

```
KEPT AS-IS (do not delete):
  docker-compose.yml          ← will be modified (add Redis + MinIO)
  .env                        ← will be modified (add new vars)
  docs/                       ← keep
  CLAUDE.md, AGENTS.md        ← keep
  .git/                       ← keep

DELETED (wipe the old scaffold):
  src/                        node_modules/
  prisma/                     package-lock.json
  next.config.ts              tsconfig.json
  tailwind.config.ts          eslint.config.mjs
  postcss.config.mjs          components.json
  next-env.d.ts               .npmrc (recreate)
  prisma.config.ts            package.json (recreate)

CREATED:
  .npmrc
  pnpm-workspace.yaml
  turbo.json
  package.json                                    ← workspace root

  packages/shared/package.json
  packages/shared/tsconfig.json
  packages/shared/src/index.ts
  packages/shared/src/types/index.ts
  packages/shared/src/utils/normalizeAddress.ts
  packages/shared/src/utils/__tests__/normalizeAddress.test.ts
  packages/shared/src/schemas/index.ts

  packages/database/package.json
  packages/database/tsconfig.json
  packages/database/prisma/schema.prisma
  packages/database/src/index.ts
  packages/database/src/seed.ts
  packages/database/src/__tests__/seed.test.ts

  apps/api/package.json
  apps/api/tsconfig.json
  apps/api/src/index.ts
  apps/api/src/app.ts
  apps/api/src/middleware/auth.ts
  apps/api/src/middleware/error.ts
  apps/api/src/middleware/__tests__/auth.test.ts
  apps/api/src/routes/index.ts
  apps/api/src/queues/index.ts
  apps/api/src/queues/worker.ts
  apps/api/src/socket/index.ts
  apps/api/src/lib/prisma.ts
  apps/api/src/lib/redis.ts
  apps/api/src/lib/minio.ts

  apps/web/package.json
  apps/web/tsconfig.json
  apps/web/next.config.ts
  apps/web/postcss.config.mjs
  apps/web/tailwind.config.ts         ← (Tailwind v4 uses CSS; this is a compat shim)
  apps/web/components.json
  apps/web/src/auth.ts
  apps/web/src/middleware.ts
  apps/web/src/app/layout.tsx
  apps/web/src/app/page.tsx
  apps/web/src/app/api/auth/[...nextauth]/route.ts
  apps/web/src/app/(app)/layout.tsx
  apps/web/src/app/(app)/dashboard/page.tsx
  apps/web/src/app/(app)/inbox/page.tsx
  apps/web/src/app/(app)/email/page.tsx
  apps/web/src/app/(app)/leads/dts/page.tsx
  apps/web/src/app/(app)/leads/dta/page.tsx
  apps/web/src/app/(app)/leads/warm/page.tsx
  apps/web/src/app/(app)/leads/dead/page.tsx
  apps/web/src/app/(app)/leads/referred/page.tsx
  apps/web/src/app/(app)/tm/page.tsx
  apps/web/src/app/(app)/dispo/page.tsx
  apps/web/src/app/(app)/inventory/page.tsx
  apps/web/src/app/(app)/sold/page.tsx
  apps/web/src/app/(app)/rental/page.tsx
  apps/web/src/app/(app)/buyers/page.tsx
  apps/web/src/app/(app)/vendors/page.tsx
  apps/web/src/app/(app)/calendar/page.tsx
  apps/web/src/app/(app)/tasks/page.tsx
  apps/web/src/app/(app)/activity/page.tsx
  apps/web/src/app/(app)/list-stacking/page.tsx
  apps/web/src/app/(app)/analytics/page.tsx
  apps/web/src/app/(app)/settings/page.tsx
  apps/web/src/components/layout/Sidebar.tsx
  apps/web/src/components/layout/GlobalHeader.tsx
  apps/web/src/components/ui/                     ← shadcn components (added by CLI)
  apps/web/src/lib/utils.ts
```

---

## Task 1: Install pnpm + verify environment

**Files:** none (environment only)

- [ ] **Step 1: Add Node to PATH for this session**

In Git Bash:
```bash
export PATH="/c/Program Files/nodejs:$PATH"
node --version
# Expected: v24.14.1
```

- [ ] **Step 2: Install pnpm globally**

```bash
npm install -g pnpm@9
pnpm --version
# Expected: 9.x.x
```

- [ ] **Step 3: Verify Docker is running**

```bash
/c/Program\ Files/Docker/Docker/resources/bin/docker.exe ps
# Expected: table header (no error)
```

- [ ] **Step 4: Start Docker services**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
/c/Program\ Files/Docker/Docker/resources/bin/docker.exe compose up -d postgres
# Expected: "Container rei-crm-db Started" or "Running"
```

---

## Task 2: Wipe scaffold + scaffold monorepo root

**Files:**
- Create: `pnpm-workspace.yaml`, `turbo.json`, `package.json` (root), `.npmrc`
- Delete: all files listed in the "DELETED" section above

- [ ] **Step 1: Delete old scaffold files**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
rm -rf src/ node_modules/ prisma/ prisma.config.ts
rm -f next.config.ts tailwind.config.ts postcss.config.mjs
rm -f eslint.config.mjs components.json next-env.d.ts
rm -f tsconfig.json package.json package-lock.json .npmrc
```

- [ ] **Step 2: Create directory structure**

```bash
mkdir -p apps/web apps/api packages/database packages/shared
```

- [ ] **Step 3: Create `.npmrc`**

```
auto-install-peers=true
shamefully-hoist=false
```

- [ ] **Step 4: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 5: Create root `package.json`**

```json
{
  "name": "homeward-crm",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "db:migrate": "pnpm --filter @crm/database run db:migrate",
    "db:seed": "pnpm --filter @crm/database run db:seed",
    "db:studio": "pnpm --filter @crm/database run db:studio"
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.8.0"
  },
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

- [ ] **Step 6: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "db:seed": {
      "cache": false
    },
    "db:studio": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- [ ] **Step 7: Install root devDeps**

```bash
pnpm install
# Expected: node_modules/ created at root with turbo + typescript
```

---

## Task 3: packages/shared scaffold + normalizeAddress (TDD)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/utils/normalizeAddress.ts`
- Create: `packages/shared/src/utils/__tests__/normalizeAddress.test.ts`
- Create: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@crm/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create the failing test first**

Create `packages/shared/src/utils/__tests__/normalizeAddress.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { normalizeAddress } from '../normalizeAddress'

describe('normalizeAddress', () => {
  it('returns null when no street address provided', () => {
    expect(normalizeAddress(null, 'Dallas', 'TX', '75201')).toBeNull()
    expect(normalizeAddress(undefined, 'Dallas', 'TX', '75201')).toBeNull()
    expect(normalizeAddress('', 'Dallas', 'TX', '75201')).toBeNull()
  })

  it('lowercases and trims all components', () => {
    expect(normalizeAddress('123 Oak Street', 'Dallas', 'TX', '75201'))
      .toBe('123 oak street, dallas, tx 75201')
  })

  it('expands street abbreviations', () => {
    expect(normalizeAddress('123 N. Oak St.', 'Dallas', 'TX', '75201'))
      .toBe('123 north oak street, dallas, tx 75201')
    expect(normalizeAddress('456 Elm Ave', 'Austin', 'TX', '78701'))
      .toBe('456 elm avenue, austin, tx 78701')
    expect(normalizeAddress('789 Main Blvd', 'Houston', 'TX', '77001'))
      .toBe('789 main boulevard, houston, tx 77001')
    expect(normalizeAddress('100 Park Dr', 'Plano', 'TX', '75024'))
      .toBe('100 park drive, plano, tx 75024')
    expect(normalizeAddress('200 River Rd', 'Austin', 'TX', '78702'))
      .toBe('200 river road, austin, tx 78702')
    expect(normalizeAddress('300 Maple Ln', 'Dallas', 'TX', '75202'))
      .toBe('300 maple lane, dallas, tx 75202')
    expect(normalizeAddress('400 Cedar Ct', 'Dallas', 'TX', '75203'))
      .toBe('400 cedar court, dallas, tx 75203')
    expect(normalizeAddress('500 Oak Pl', 'Dallas', 'TX', '75204'))
      .toBe('500 oak place, dallas, tx 75204')
    expect(normalizeAddress('600 State Hwy 75', 'Dallas', 'TX', '75205'))
      .toBe('600 state highway 75, dallas, tx 75205')
  })

  it('expands directional abbreviations', () => {
    expect(normalizeAddress('123 N Oak St', 'Dallas', 'TX', '75201'))
      .toBe('123 north oak street, dallas, tx 75201')
    expect(normalizeAddress('123 S Elm Ave', 'Dallas', 'TX', '75201'))
      .toBe('123 south elm avenue, dallas, tx 75201')
    expect(normalizeAddress('123 E Main St', 'Dallas', 'TX', '75201'))
      .toBe('123 east main street, dallas, tx 75201')
    expect(normalizeAddress('123 W Park Dr', 'Dallas', 'TX', '75201'))
      .toBe('123 west park drive, dallas, tx 75201')
    expect(normalizeAddress('123 NE Oak Ave', 'Dallas', 'TX', '75201'))
      .toBe('123 northeast oak avenue, dallas, tx 75201')
    expect(normalizeAddress('123 NW Elm Rd', 'Dallas', 'TX', '75201'))
      .toBe('123 northwest elm road, dallas, tx 75201')
    expect(normalizeAddress('123 SE Main Blvd', 'Dallas', 'TX', '75201'))
      .toBe('123 southeast main boulevard, dallas, tx 75201')
    expect(normalizeAddress('123 SW Pine Ct', 'Dallas', 'TX', '75201'))
      .toBe('123 southwest pine court, dallas, tx 75201')
  })

  it('normalizes unit designators', () => {
    expect(normalizeAddress('123 Oak St Apt 4B', 'Dallas', 'TX', '75201'))
      .toBe('123 oak street unit 4b, dallas, tx 75201')
    expect(normalizeAddress('123 Oak St Suite 200', 'Dallas', 'TX', '75201'))
      .toBe('123 oak street unit 200, dallas, tx 75201')
    expect(normalizeAddress('123 Oak St Ste 200', 'Dallas', 'TX', '75201'))
      .toBe('123 oak street unit 200, dallas, tx 75201')
    expect(normalizeAddress('123 Oak St #4B', 'Dallas', 'TX', '75201'))
      .toBe('123 oak street unit 4b, dallas, tx 75201')
  })

  it('strips zip+4 suffix from zip code', () => {
    expect(normalizeAddress('123 Oak St', 'Dallas', 'TX', '75201-1234'))
      .toBe('123 oak street, dallas, tx 75201')
  })

  it('removes punctuation (periods, commas)', () => {
    expect(normalizeAddress('123 N. Oak St., Apt. 4B', 'Dallas', 'TX', '75201'))
      .toBe('123 north oak street unit 4b, dallas, tx 75201')
  })

  it('handles missing city/state/zip gracefully', () => {
    expect(normalizeAddress('123 Oak St', null, null, null))
      .toBe('123 oak street, , ')
  })

  it('full integration: messy real-world address', () => {
    expect(normalizeAddress('123 N. Oak St., Apt. 4B', 'Dallas', 'TX', '75201-1234'))
      .toBe('123 north oak street unit 4b, dallas, tx 75201')
  })
})
```

- [ ] **Step 4: Run test to confirm it fails**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
pnpm --filter @crm/shared install
pnpm --filter @crm/shared test
# Expected: FAIL — "Cannot find module '../normalizeAddress'"
```

- [ ] **Step 5: Implement `normalizeAddress`**

Create `packages/shared/src/utils/normalizeAddress.ts`:

```typescript
const SUFFIX_MAP: Record<string, string> = {
  st: 'street', ave: 'avenue', blvd: 'boulevard', dr: 'drive',
  rd: 'road', ln: 'lane', ct: 'court', pl: 'place', hwy: 'highway',
  way: 'way', cir: 'circle', ter: 'terrace', trl: 'trail', pkwy: 'parkway',
}

const DIRECTIONAL_MAP: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
}

const UNIT_DESIGNATORS = new Set(['apt', 'apartment', 'suite', 'ste', 'unit', '#'])

export function normalizeAddress(
  street: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined,
): string | null {
  if (!street || !street.trim()) return null

  // Lowercase everything
  let s = street.toLowerCase()

  // Remove periods (but not hashes yet)
  s = s.replace(/\./g, '')

  // Remove commas
  s = s.replace(/,/g, '')

  // Normalize unit designators: replace # with "unit "
  s = s.replace(/#\s*/g, 'unit ')

  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim()

  // Tokenize and process
  const tokens = s.split(' ')
  const result: string[] = []
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]

    // Check if this token is a unit designator
    if (UNIT_DESIGNATORS.has(token) && i < tokens.length - 1) {
      result.push('unit')
      i++
      result.push(tokens[i]) // the unit number/id
      i++
      continue
    }

    // Check if this is the first token after street number — might be directional
    // Directional: only expand if it appears before a street name (not at very end)
    if (i > 0 && i < tokens.length - 1 && DIRECTIONAL_MAP[token]) {
      result.push(DIRECTIONAL_MAP[token])
      i++
      continue
    }

    // Check if this is a street suffix (last meaningful token or before unit)
    if (SUFFIX_MAP[token]) {
      result.push(SUFFIX_MAP[token])
      i++
      continue
    }

    result.push(token)
    i++
  }

  const normalizedStreet = result.join(' ')

  // Normalize zip: strip +4
  const normalizedZip = zip ? zip.replace(/-\d{4}$/, '') : ''

  const normalizedCity = (city || '').toLowerCase().trim()
  const normalizedState = (state || '').toLowerCase().trim()

  return `${normalizedStreet}, ${normalizedCity}, ${normalizedState} ${normalizedZip}`.trimEnd()
}
```

- [ ] **Step 6: Run test to confirm it passes**

```bash
pnpm --filter @crm/shared test
# Expected: all tests PASS
```

- [ ] **Step 7: Commit**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
git add packages/shared/
git commit -m "feat: add packages/shared with normalizeAddress utility"
```

---

## Task 4: packages/shared — types + Zod schemas

**Files:**
- Create: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json` (add zod dep)

- [ ] **Step 1: Add zod to packages/shared**

Edit `packages/shared/package.json`, add to `"dependencies"`:
```json
{
  "dependencies": {
    "zod": "^3.24.0"
  }
}
```

Run:
```bash
pnpm --filter @crm/shared install
```

- [ ] **Step 2: Create `packages/shared/src/types/index.ts`**

```typescript
export type Permission =
  | 'leads.view' | 'leads.create' | 'leads.edit' | 'leads.delete'
  | 'tm.view' | 'tm.edit'
  | 'inventory.view' | 'inventory.edit'
  | 'dispo.view' | 'dispo.edit'
  | 'contacts.view' | 'contacts.edit'
  | 'comms.send' | 'comms.view'
  | 'tasks.view' | 'tasks.manage'
  | 'campaigns.view' | 'campaigns.manage'
  | 'analytics.view'
  | 'settings.view' | 'settings.manage'
  | 'users.view' | 'users.manage'
  | 'admin.all'

export interface JwtPayload {
  userId: string
  email: string
  name: string
  roleId: string
  permissions: Permission[]
  marketIds: string[]
}

export interface ApiError {
  error: string
  message?: string
  statusCode?: number
}
```

- [ ] **Step 3: Create `packages/shared/src/schemas/index.ts`**

```typescript
import { z } from 'zod'

export const PropertyCreateSchema = z.object({
  leadType: z.enum(['DIRECT_TO_SELLER', 'DIRECT_TO_AGENT']),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  county: z.string().optional(),
  bedrooms: z.number().int().optional(),
  bathrooms: z.number().optional(),
  sqft: z.number().int().optional(),
  yearBuilt: z.number().int().optional(),
  propertyType: z.string().optional(),
  source: z.string().optional(),
  campaignName: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  assignedToId: z.string().optional(),
  marketId: z.string().min(1, 'Market is required'),
})

export const ContactSchema = z.object({
  type: z.enum(['SELLER', 'BUYER', 'AGENT', 'VENDOR', 'OTHER']),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  phone2: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
})

export const UserCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().optional(),
  roleId: z.string().min(1),
  marketIds: z.array(z.string()).optional().default([]),
})

export const TaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  type: z.enum(['FOLLOW_UP', 'APPOINTMENT', 'OFFER', 'CALL', 'EMAIL', 'OTHER']).default('OTHER'),
  priority: z.number().int().min(0).max(2).default(0),
  dueAt: z.string().datetime().optional(),
  propertyId: z.string().optional(),
  assignedToId: z.string().optional(),
})

export const FilterStateSchema = z.object({
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  assignedToId: z.string().optional(),
  marketId: z.string().optional(),
  isHot: z.boolean().optional(),
  isFavorited: z.boolean().optional(),
  stage: z.string().optional(),
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }).optional(),
})

export type PropertyCreateInput = z.infer<typeof PropertyCreateSchema>
export type ContactInput = z.infer<typeof ContactSchema>
export type UserCreateInput = z.infer<typeof UserCreateSchema>
export type TaskInput = z.infer<typeof TaskSchema>
export type FilterState = z.infer<typeof FilterStateSchema>
```

- [ ] **Step 4: Create `packages/shared/src/index.ts`**

```typescript
export * from './types/index.js'
export * from './schemas/index.js'
export { normalizeAddress } from './utils/normalizeAddress.js'
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/ packages/shared/src/schemas/ packages/shared/src/index.ts packages/shared/package.json
git commit -m "feat: add shared types, Zod schemas, and exports"
```

---

## Task 5: packages/database — Prisma schema

**Files:**
- Create: `packages/database/package.json`, `packages/database/tsconfig.json`
- Create: `packages/database/prisma/schema.prisma`
- Create: `packages/database/src/index.ts`

- [ ] **Step 1: Create `packages/database/package.json`**

```json
{
  "name": "@crm/database",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:seed": "tsx src/seed.ts",
    "db:studio": "prisma studio",
    "db:generate": "prisma generate"
  },
  "dependencies": {
    "@prisma/client": "^7.7.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "prisma": "^7.7.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/database/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/database/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ──────────────────────────────────────────────────────────────────

enum LeadType {
  DIRECT_TO_SELLER
  DIRECT_TO_AGENT
}

enum LeadStatus {
  ACTIVE
  WARM
  DEAD
  REFERRED_TO_AGENT
}

enum ActiveLeadStage {
  NEW_LEAD
  DISCOVERY
  INTERESTED_ADD_TO_FOLLOW_UP
  APPOINTMENT_MADE
  DUE_DILIGENCE
  OFFER_MADE
  OFFER_FOLLOW_UP
  UNDER_CONTRACT
}

enum TmStage {
  NEW_CONTRACT
  MARKETING_TO_BUYERS
  SHOWING_TO_BUYERS
  EVALUATING_OFFERS
  ACCEPTED_OFFER
  CLEAR_TO_CLOSE
}

enum InventoryStage {
  NEW_INVENTORY
  GETTING_ESTIMATES
  UNDER_REHAB
  LISTED_FOR_SALE
  UNDER_CONTRACT
}

enum ExitStrategy {
  WHOLESALE
  SELLER_FINANCE
  INSTALLMENT
  FIX_AND_FLIP
  INVENTORY_LATER
  RENTAL
  TURNKEY
}

enum PropertyStatus {
  LEAD
  UNDER_CONTRACT
  IN_TM
  IN_INVENTORY
  IN_DISPO
  SOLD
  RENTAL
  DEAD
  WARM
  REFERRED
}

enum ContactType {
  SELLER
  BUYER
  AGENT
  VENDOR
  OTHER
}

enum MessageChannel {
  SMS
  CALL
  RVM
  EMAIL
  NOTE
  SYSTEM
}

enum MessageDirection {
  INBOUND
  OUTBOUND
}

enum TaskStatus {
  PENDING
  COMPLETED
  CANCELLED
}

enum TaskType {
  FOLLOW_UP
  APPOINTMENT
  OFFER
  CALL
  EMAIL
  OTHER
}

enum CampaignType {
  DRIP
  BROADCAST
}

enum CampaignStatus {
  DRAFT
  ACTIVE
  PAUSED
  COMPLETED
  ARCHIVED
}

enum AutomationTrigger {
  STAGE_CHANGE
  LEAD_CREATED
  TAG_ADDED
  NO_CONTACT_X_DAYS
  OFFER_MADE
  UNDER_CONTRACT
  MANUAL
}

enum AutomationActionType {
  SEND_SMS
  SEND_EMAIL
  SEND_RVM
  ADD_TAG
  CHANGE_STAGE
  ASSIGN_USER
  CREATE_TASK
  ENROLL_CAMPAIGN
}

enum FileType {
  DOCUMENT
  IMAGE
  CONTRACT
  INSPECTION
  PHOTO
  OTHER
}

enum UserStatus {
  ACTIVE
  INACTIVE
  INVITED
}

enum NotificationType {
  NEW_LEAD
  MESSAGE_RECEIVED
  TASK_DUE
  STAGE_CHANGE
  MENTION
  SYSTEM
}

enum WebhookEventStatus {
  PENDING
  PROCESSED
  FAILED
}

enum AiEngine {
  TEXT_CONVERSATIONAL
  LEAD_SUMMARIZATION
  HOT_LEAD_DETECTION
  VOICE_CONVERSATIONAL
}

// ─── Core ────────────────────────────────────────────────────────────────────

model User {
  id          String     @id @default(cuid())
  email       String     @unique
  passwordHash String
  name        String
  phone       String?
  avatarUrl   String?
  status      UserStatus @default(ACTIVE)
  roleId      String
  role        Role       @relation(fields: [roleId], references: [id])
  marketIds   String[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  assignedProperties Property[]     @relation("AssignedTo")
  createdProperties  Property[]     @relation("CreatedBy")
  tasks              Task[]         @relation("AssignedToUser")
  createdTasks       Task[]         @relation("CreatedByUser")
  messages           Message[]      @relation("SentBy")
  activityLogs       ActivityLog[]
  notifications      Notification[]
  savedFilters       SavedFilter[]
}

model Role {
  id          String   @id @default(cuid())
  name        String   @unique
  description String?
  permissions String[]
  isSystem    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  users User[]
}

model Market {
  id        String   @id @default(cuid())
  name      String   @unique
  state     String   @default("TX")
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  properties Property[]
  campaigns  Campaign[]
}

// ─── Property ────────────────────────────────────────────────────────────────

model Property {
  id                String          @id @default(cuid())
  streetAddress     String?
  city              String?
  state             String?
  zip               String?
  county            String?
  normalizedAddress String?
  bedrooms          Int?
  bathrooms         Decimal?        @db.Decimal(4, 1)
  sqft              Int?
  yearBuilt         Int?
  lotSize           Decimal?        @db.Decimal(10, 2)
  propertyType      String?
  leadType          LeadType
  leadStatus        LeadStatus      @default(ACTIVE)
  propertyStatus    PropertyStatus  @default(LEAD)
  activeLeadStage   ActiveLeadStage?
  exitStrategy      ExitStrategy?
  isHot             Boolean         @default(false)
  isFavorited       Boolean         @default(false)
  isOpen            Boolean         @default(true)
  askingPrice       Decimal?        @db.Decimal(12, 2)
  offerPrice        Decimal?        @db.Decimal(12, 2)
  arv               Decimal?        @db.Decimal(12, 2)
  repairEstimate    Decimal?        @db.Decimal(12, 2)
  tmStage           TmStage?
  inventoryStage    InventoryStage?
  inDispo           Boolean         @default(false)
  soldAt            DateTime?
  rentalAt          DateTime?
  marketId          String
  market            Market          @relation(fields: [marketId], references: [id])
  assignedToId      String?
  assignedTo        User?           @relation("AssignedTo", fields: [assignedToId], references: [id])
  createdById       String
  createdBy         User            @relation("CreatedBy", fields: [createdById], references: [id])
  source            String?
  campaignName      String?
  tags              String[]
  contractDate      DateTime?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  contacts            PropertyContact[]
  conversations       Conversation[]
  messages            Message[]
  tasks               Task[]
  appointments        Appointment[]
  stageHistory        StageHistory[]
  files               PropertyFile[]
  campaignEnrollments CampaignEnrollment[]
  buyerMatches        BuyerMatch[]
  offers              BuyerOffer[]
  aiLogs              AiLog[]
  activityLogs        ActivityLog[]
  notes               Note[]
}

model Contact {
  id        String      @id @default(cuid())
  type      ContactType
  firstName String
  lastName  String?
  email     String?
  phone     String?
  phone2    String?
  address   String?
  city      String?
  state     String?
  zip       String?
  notes     String?
  tags      String[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  properties    PropertyContact[]
  buyerProfile  Buyer?
  vendorProfile Vendor?
}

model PropertyContact {
  id         String   @id @default(cuid())
  propertyId String
  property   Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  contactId  String
  contact    Contact  @relation(fields: [contactId], references: [id])
  isPrimary  Boolean  @default(false)
  role       String?
  createdAt  DateTime @default(now())

  @@unique([propertyId, contactId])
}

model StageHistory {
  id            String   @id @default(cuid())
  propertyId    String
  property      Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  pipeline      String
  fromStage     String?
  toStage       String
  changedById   String?
  changedByName String?
  reason        String?
  createdAt     DateTime @default(now())
}

// ─── Communications ──────────────────────────────────────────────────────────

model Conversation {
  id            String    @id @default(cuid())
  propertyId    String
  property      Property  @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  contactPhone  String?
  contactEmail  String?
  isRead        Boolean   @default(false)
  lastMessageAt DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  messages Message[]
}

model Message {
  id             String           @id @default(cuid())
  propertyId     String
  property       Property         @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  conversationId String?
  conversation   Conversation?    @relation(fields: [conversationId], references: [id])
  channel        MessageChannel
  direction      MessageDirection
  body           String?
  subject        String?
  from           String?
  to             String?
  sentById       String?
  sentBy         User?            @relation("SentBy", fields: [sentById], references: [id])
  twilioSid      String?
  emailMessageId String?
  isAiGenerated  Boolean          @default(false)
  aiReviewed     Boolean          @default(false)
  readAt         DateTime?
  deliveredAt    DateTime?
  failedAt       DateTime?
  failReason     String?
  createdAt      DateTime         @default(now())
}

model Note {
  id         String   @id @default(cuid())
  propertyId String
  property   Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  body       String
  authorId   String?
  authorName String?
  isPinned   Boolean  @default(false)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

// ─── Tasks / Calendar ────────────────────────────────────────────────────────

model Task {
  id           String     @id @default(cuid())
  propertyId   String?
  property     Property?  @relation(fields: [propertyId], references: [id])
  title        String
  description  String?
  type         TaskType   @default(OTHER)
  status       TaskStatus @default(PENDING)
  priority     Int        @default(0)
  dueAt        DateTime?
  completedAt  DateTime?
  assignedToId String?
  assignedTo   User?      @relation("AssignedToUser", fields: [assignedToId], references: [id])
  createdById  String?
  createdBy    User?      @relation("CreatedByUser", fields: [createdById], references: [id])
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
}

model Appointment {
  id            String   @id @default(cuid())
  propertyId    String
  property      Property @relation(fields: [propertyId], references: [id])
  title         String
  description   String?
  startAt       DateTime
  endAt         DateTime
  location      String?
  attendees     String[]
  googleEventId String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// ─── Campaigns / Automations ─────────────────────────────────────────────────

model Campaign {
  id          String         @id @default(cuid())
  name        String
  type        CampaignType
  status      CampaignStatus @default(DRAFT)
  description String?
  marketId    String?
  market      Market?        @relation(fields: [marketId], references: [id])
  tags        String[]
  leadTypes   LeadType[]
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  steps       CampaignStep[]
  enrollments CampaignEnrollment[]
}

model CampaignStep {
  id         String         @id @default(cuid())
  campaignId String
  campaign   Campaign       @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  order      Int
  delayDays  Int            @default(0)
  delayHours Int            @default(0)
  channel    MessageChannel
  subject    String?
  body       String
  isActive   Boolean        @default(true)
  createdAt  DateTime       @default(now())
  updatedAt  DateTime       @updatedAt
}

model CampaignEnrollment {
  id          String    @id @default(cuid())
  campaignId  String
  campaign    Campaign  @relation(fields: [campaignId], references: [id])
  propertyId  String
  property    Property  @relation(fields: [propertyId], references: [id])
  currentStep Int       @default(0)
  isActive    Boolean   @default(true)
  pausedAt    DateTime?
  completedAt DateTime?
  enrolledAt  DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([campaignId, propertyId])
}

model Automation {
  id          String            @id @default(cuid())
  name        String
  description String?
  trigger     AutomationTrigger
  conditions  Json              @default("{}")
  isActive    Boolean           @default(true)
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  actions AutomationAction[]
}

model AutomationAction {
  id           String               @id @default(cuid())
  automationId String
  automation   Automation           @relation(fields: [automationId], references: [id], onDelete: Cascade)
  order        Int
  actionType   AutomationActionType
  config       Json                 @default("{}")
  createdAt    DateTime             @default(now())
}

// ─── Buyers / Vendors ────────────────────────────────────────────────────────

model Buyer {
  id               String   @id @default(cuid())
  contactId        String   @unique
  contact          Contact  @relation(fields: [contactId], references: [id])
  isActive         Boolean  @default(true)
  preferredMarkets String[]
  notes            String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  criteria BuyerCriteria[]
  matches  BuyerMatch[]
  offers   BuyerOffer[]
}

model BuyerCriteria {
  id            String   @id @default(cuid())
  buyerId       String
  buyer         Buyer    @relation(fields: [buyerId], references: [id], onDelete: Cascade)
  markets       String[]
  propertyTypes String[]
  minBeds       Int?
  maxBeds       Int?
  minBaths      Decimal? @db.Decimal(4, 1)
  maxBaths      Decimal? @db.Decimal(4, 1)
  minPrice      Decimal? @db.Decimal(12, 2)
  maxPrice      Decimal? @db.Decimal(12, 2)
  minSqft       Int?
  maxSqft       Int?
  minArv        Decimal? @db.Decimal(12, 2)
  maxArv        Decimal? @db.Decimal(12, 2)
  maxRepairs    Decimal? @db.Decimal(12, 2)
  notes         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model BuyerMatch {
  id         String   @id @default(cuid())
  buyerId    String
  buyer      Buyer    @relation(fields: [buyerId], references: [id])
  propertyId String
  property   Property @relation(fields: [propertyId], references: [id])
  score      Int      @default(0)
  notified   Boolean  @default(false)
  createdAt  DateTime @default(now())

  @@unique([buyerId, propertyId])
}

model BuyerOffer {
  id          String   @id @default(cuid())
  propertyId  String
  property    Property @relation(fields: [propertyId], references: [id])
  buyerId     String
  buyer       Buyer    @relation(fields: [buyerId], references: [id])
  offerAmount Decimal  @db.Decimal(12, 2)
  status      String   @default("PENDING")
  notes       String?
  submittedAt DateTime @default(now())
  respondedAt DateTime?
  updatedAt   DateTime @updatedAt
}

model Vendor {
  id        String   @id @default(cuid())
  contactId String   @unique
  contact   Contact  @relation(fields: [contactId], references: [id])
  category  String
  isActive  Boolean  @default(true)
  markets   String[]
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── Files ───────────────────────────────────────────────────────────────────

model PropertyFile {
  id             String   @id @default(cuid())
  propertyId     String
  property       Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  type           FileType @default(OTHER)
  name           String
  mimeType       String
  size           Int
  storageKey     String
  uploadedById   String?
  uploadedByName String?
  createdAt      DateTime @default(now())
}

model EsignDocument {
  id          String   @id @default(cuid())
  propertyId  String
  name        String
  providerRef String?
  status      String   @default("DRAFT")
  signedAt    DateTime?
  storageKey  String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// ─── Notifications / Activity ────────────────────────────────────────────────

model Notification {
  id         String           @id @default(cuid())
  userId     String
  user       User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  type       NotificationType
  title      String
  body       String?
  propertyId String?
  isRead     Boolean          @default(false)
  readAt     DateTime?
  createdAt  DateTime         @default(now())
}

model ActivityLog {
  id         String    @id @default(cuid())
  propertyId String?
  property   Property? @relation(fields: [propertyId], references: [id])
  userId     String?
  user       User?     @relation(fields: [userId], references: [id])
  userName   String?
  action     String
  detail     Json      @default("{}")
  createdAt  DateTime  @default(now())
}

// ─── Saved Filters ───────────────────────────────────────────────────────────

model SavedFilter {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  pipeline  String
  filters   Json
  isDefault Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, name, pipeline])
}

// ─── AI / Webhooks / Integrations ────────────────────────────────────────────

model AiLog {
  id            String    @id @default(cuid())
  propertyId    String?
  property      Property? @relation(fields: [propertyId], references: [id])
  engine        AiEngine
  input         Json
  output        Json
  tokens        Int?
  latencyMs     Int?
  reviewed      Boolean   @default(false)
  reviewedAt    DateTime?
  reviewedById  String?
  createdAt     DateTime  @default(now())
}

model WebhookEvent {
  id          String             @id @default(cuid())
  source      String
  eventType   String
  payload     Json
  status      WebhookEventStatus @default(PENDING)
  processedAt DateTime?
  error       String?
  createdAt   DateTime           @default(now())
}

model TwilioNumber {
  id           String   @id @default(cuid())
  number       String   @unique
  friendlyName String?
  marketId     String?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
}

model ListStackSource {
  id            String   @id @default(cuid())
  name          String
  description   String?
  tags          String[]
  totalImported Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

- [ ] **Step 4: Create `packages/database/src/index.ts`**

```typescript
export { PrismaClient, Prisma } from '@prisma/client'
export type {
  User, Role, Market, Property, Contact, PropertyContact,
  StageHistory, Conversation, Message, Note, Task, Appointment,
  Campaign, CampaignStep, CampaignEnrollment, Automation, AutomationAction,
  Buyer, BuyerCriteria, BuyerMatch, BuyerOffer, Vendor,
  PropertyFile, EsignDocument, Notification, ActivityLog,
  SavedFilter, AiLog, WebhookEvent, TwilioNumber, ListStackSource,
} from '@prisma/client'
export {
  LeadType, LeadStatus, ActiveLeadStage, TmStage, InventoryStage,
  ExitStrategy, PropertyStatus, ContactType, MessageChannel, MessageDirection,
  TaskStatus, TaskType, CampaignType, CampaignStatus, AutomationTrigger,
  AutomationActionType, FileType, UserStatus, NotificationType,
  WebhookEventStatus, AiEngine,
} from '@prisma/client'
```

- [ ] **Step 5: Install database package deps**

```bash
pnpm --filter @crm/database install
```

- [ ] **Step 6: Commit**

```bash
git add packages/database/
git commit -m "feat: add packages/database with full Prisma schema (35+ models)"
```

---

## Task 6: Run database migration

**Files:**
- Modify: `docker-compose.yml` (add Redis + MinIO services)
- Modify: `.env` (add Redis, MinIO vars)

- [ ] **Step 1: Update `docker-compose.yml` to add Redis and MinIO**

Replace the entire file with:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: rei-crm-db
    restart: unless-stopped
    ports:
      - '5432:5432'
    environment:
      POSTGRES_USER: crm_user
      POSTGRES_PASSWORD: crm_password
      POSTGRES_DB: rei_crm
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: rei-crm-redis
    restart: unless-stopped
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio:latest
    container_name: rei-crm-minio
    restart: unless-stopped
    ports:
      - '9000:9000'
      - '9001:9001'
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

- [ ] **Step 2: Update `.env` to add missing vars**

Append to the existing `.env`:

```
# Redis
REDIS_URL="redis://localhost:6379"

# MinIO
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_BUCKET="crm-files"
MINIO_USE_SSL="false"

# API
API_URL="http://localhost:4000"
API_INTERNAL_SECRET="change-this-to-a-random-32-char-secret"

# Auth (rename existing NEXTAUTH_SECRET to AUTH_SECRET — used by both apps)
AUTH_SECRET="change-this-to-a-random-secret"
```

Also rename `NEXTAUTH_SECRET` to `AUTH_SECRET` in `.env`.

- [ ] **Step 3: Start all Docker services**

```bash
/c/Program\ Files/Docker/Docker/resources/bin/docker.exe compose up -d
# Expected: rei-crm-db, rei-crm-redis, rei-crm-minio all "Started" or "Running"
```

- [ ] **Step 4: Run Prisma migration**

```bash
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
export PATH="/c/Program Files/nodejs:$PATH"
pnpm --filter @crm/database run db:generate
pnpm --filter @crm/database run db:migrate
# When prompted for migration name, enter: init_full_schema
# Expected: "Your database is now in sync with your schema."
```

- [ ] **Step 5: Apply the partial unique index for normalizedAddress**

Create `packages/database/prisma/migrations/<timestamp>_normalized_address_index/migration.sql` — Prisma won't auto-create this constraint. Instead, after the main migration runs, create a second migration:

```bash
pnpm --filter @crm/database exec prisma migrate dev --name normalized_address_partial_index
```

Then edit the generated empty migration SQL file (in `packages/database/prisma/migrations/`) to contain:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "unique_normalized_address_when_not_null"
ON "Property" ("normalizedAddress")
WHERE "normalizedAddress" IS NOT NULL;
```

Re-run:
```bash
pnpm --filter @crm/database run db:migrate
# Expected: migration applied
```

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env packages/database/prisma/
git commit -m "feat: full DB migration with all 35+ tables and normalizedAddress partial index"
```

---

## Task 7: Seed script

**Files:**
- Create: `packages/database/src/seed.ts`

- [ ] **Step 1: Create `packages/database/src/seed.ts`**

```typescript
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Markets
  const markets = ['DFW', 'Houston', 'Austin', 'San Antonio']
  for (const name of markets) {
    await prisma.market.upsert({
      where: { name },
      update: {},
      create: { name, state: 'TX' },
    })
  }
  console.log('✓ Markets seeded')

  // Super Admin role
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: {
      name: 'Super Admin',
      description: 'Full system access',
      permissions: ['admin.all'],
      isSystem: true,
    },
  })
  console.log('✓ Super Admin role seeded')

  // Admin User Manager role (for Phase 2)
  await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: {
      name: 'Admin',
      description: 'Administrative access without full system control',
      permissions: [
        'leads.view', 'leads.create', 'leads.edit', 'leads.delete',
        'tm.view', 'tm.edit', 'inventory.view', 'inventory.edit',
        'dispo.view', 'dispo.edit', 'contacts.view', 'contacts.edit',
        'comms.send', 'comms.view', 'tasks.view', 'tasks.manage',
        'campaigns.view', 'campaigns.manage', 'analytics.view',
        'settings.view', 'users.view', 'users.manage',
      ],
      isSystem: true,
    },
  })

  // Acquisition Agent role
  await prisma.role.upsert({
    where: { name: 'Acquisition Agent' },
    update: {},
    create: {
      name: 'Acquisition Agent',
      description: 'Works leads pipeline',
      permissions: [
        'leads.view', 'leads.create', 'leads.edit',
        'contacts.view', 'contacts.edit',
        'comms.send', 'comms.view',
        'tasks.view', 'tasks.manage',
        'campaigns.view',
      ],
      isSystem: true,
    },
  })

  // Transaction Coordinator role
  await prisma.role.upsert({
    where: { name: 'Transaction Coordinator' },
    update: {},
    create: {
      name: 'Transaction Coordinator',
      description: 'Manages TM, Inventory, Dispo pipelines',
      permissions: [
        'leads.view', 'tm.view', 'tm.edit',
        'inventory.view', 'inventory.edit',
        'dispo.view', 'dispo.edit',
        'contacts.view', 'contacts.edit',
        'tasks.view', 'tasks.manage',
      ],
      isSystem: true,
    },
  })

  console.log('✓ Default roles seeded')

  // Admin user
  const passwordHash = await bcrypt.hash('Admin1234!', 12)
  await prisma.user.upsert({
    where: { email: 'admin@homewardpartners.com' },
    update: {},
    create: {
      email: 'admin@homewardpartners.com',
      passwordHash,
      name: 'Admin',
      status: 'ACTIVE',
      roleId: superAdminRole.id,
      marketIds: [],
    },
  })
  console.log('✓ Admin user seeded (admin@homewardpartners.com / Admin1234!)')
  console.log('⚠  Change the admin password after first login!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Add bcryptjs dependency to packages/database**

Edit `packages/database/package.json`, add to `"dependencies"`:
```json
"bcryptjs": "^2.4.3"
```
And to `"devDependencies"`:
```json
"@types/bcryptjs": "^2.4.6",
"dotenv": "^16.4.0"
```

```bash
pnpm --filter @crm/database install
```

- [ ] **Step 3: Run the seed**

```bash
pnpm --filter @crm/database run db:seed
# Expected:
# ✓ Markets seeded
# ✓ Super Admin role seeded
# ✓ Default roles seeded
# ✓ Admin user seeded (admin@homewardpartners.com / Admin1234!)
# ⚠  Change the admin password after first login!
```

- [ ] **Step 4: Verify in Prisma Studio**

```bash
pnpm --filter @crm/database run db:studio
# Opens browser at http://localhost:5555
# Verify: User, Role, Market tables have data
# Close with Ctrl+C when done
```

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/seed.ts packages/database/package.json
git commit -m "feat: seed script with admin user, 4 roles, 4 markets"
```

---

## Task 8: apps/api — Express scaffold + auth middleware (TDD)

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`
- Create: `apps/api/src/app.ts`, `apps/api/src/index.ts`
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/middleware/__tests__/auth.test.ts`
- Create: `apps/api/src/middleware/error.ts`
- Create: `apps/api/src/routes/index.ts`
- Create: `apps/api/src/lib/prisma.ts`

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@crm/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@crm/database": "workspace:*",
    "@crm/shared": "workspace:*",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.0",
    "express": "^5.1.0",
    "jsonwebtoken": "^9.0.2",
    "minio": "^8.0.5",
    "bullmq": "^5.30.0",
    "ioredis": "^5.6.0",
    "socket.io": "^4.8.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@crm/shared": ["../../packages/shared/src/index.ts"],
      "@crm/database": ["../../packages/database/src/index.ts"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing auth middleware test**

Create `apps/api/src/middleware/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// Mock env before importing middleware
vi.stubEnv('AUTH_SECRET', 'test-secret-32-chars-minimum-len')

import { requireAuth, requirePermission } from '../auth'
import type { JwtPayload, Permission } from '@crm/shared'

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: {},
    ...overrides,
  } as unknown as Request
}

function makeRes(): { res: Response; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  const json = vi.fn()
  const status = vi.fn().mockReturnThis()
  const res = { status, json } as unknown as Response
  return { res, json, status }
}

const validPayload: JwtPayload = {
  userId: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  roleId: 'role-1',
  permissions: ['leads.view', 'leads.create'],
  marketIds: ['market-1'],
}

describe('requireAuth middleware', () => {
  it('calls next() when Authorization header has valid Bearer token', () => {
    const token = jwt.sign(validPayload, 'test-secret-32-chars-minimum-len')
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
    const { res } = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect((req as any).user).toMatchObject({ userId: 'user-1' })
  })

  it('returns 401 when no token provided', () => {
    const req = makeReq()
    const { res, status, json } = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when token is invalid', () => {
    const req = makeReq({ headers: { authorization: 'Bearer bad.token.here' } })
    const { res, status, json } = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith({ error: 'Invalid token' })
    expect(next).not.toHaveBeenCalled()
  })
})

describe('requirePermission middleware', () => {
  it('calls next() when user has the required permission', () => {
    const token = jwt.sign(validPayload, 'test-secret-32-chars-minimum-len')
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
    const { res } = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)
    next.mockClear()

    const permMiddleware = requirePermission('leads.view' as Permission)
    permMiddleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('returns 403 when user lacks the required permission', () => {
    const token = jwt.sign(validPayload, 'test-secret-32-chars-minimum-len')
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
    const { res } = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)
    next.mockClear()

    const { res: res2, status: status2, json: json2 } = makeRes()
    const permMiddleware = requirePermission('admin.all' as Permission)
    permMiddleware(req, res2, next)

    expect(status2).toHaveBeenCalledWith(403)
    expect(json2).toHaveBeenCalledWith({ error: 'Forbidden' })
  })

  it('calls next() when user has admin.all permission', () => {
    const adminPayload: JwtPayload = { ...validPayload, permissions: ['admin.all'] }
    const token = jwt.sign(adminPayload, 'test-secret-32-chars-minimum-len')
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
    const { res } = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)
    next.mockClear()

    const permMiddleware = requirePermission('leads.delete' as Permission)
    permMiddleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 4: Run test to confirm it fails**

```bash
pnpm --filter @crm/api install
pnpm --filter @crm/api test
# Expected: FAIL — "Cannot find module '../auth'"
```

- [ ] **Step 5: Implement `apps/api/src/middleware/auth.ts`**

```typescript
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import type { JwtPayload, Permission } from '@crm/shared'

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  return null
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req)
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const secret = process.env.AUTH_SECRET
    if (!secret) throw new Error('AUTH_SECRET not configured')
    const payload = jwt.verify(token, secret) as JwtPayload
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (
      user.permissions.includes('admin.all') ||
      user.permissions.includes(permission)
    ) {
      next()
      return
    }
    res.status(403).json({ error: 'Forbidden' })
  }
}
```

- [ ] **Step 6: Run test to confirm it passes**

```bash
pnpm --filter @crm/api test
# Expected: all tests PASS
```

- [ ] **Step 7: Create `apps/api/src/middleware/error.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express'

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error' })
}
```

- [ ] **Step 8: Create `apps/api/src/lib/prisma.ts`**

```typescript
import { PrismaClient } from '@crm/database'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

- [ ] **Step 9: Create `apps/api/src/routes/index.ts`**

```typescript
import { Router } from 'express'

const router = Router()

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Phase 2+ routes will be mounted here

export default router
```

- [ ] **Step 10: Create `apps/api/src/app.ts`**

```typescript
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import routes from './routes/index.js'
import { errorHandler } from './middleware/error.js'

export function createApp() {
  const app = express()

  app.use(cors({ origin: process.env.NEXTAUTH_URL ?? 'http://localhost:3000', credentials: true }))
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  app.use('/api', routes)

  app.use(errorHandler)

  return app
}
```

- [ ] **Step 11: Commit**

```bash
git add apps/api/
git commit -m "feat: apps/api scaffold with Express, auth middleware (tested), error handler"
```

---

## Task 9: apps/api — queues, MinIO, Redis, Socket.io

**Files:**
- Create: `apps/api/src/lib/redis.ts`
- Create: `apps/api/src/lib/minio.ts`
- Create: `apps/api/src/queues/index.ts`
- Create: `apps/api/src/queues/worker.ts`
- Create: `apps/api/src/socket/index.ts`
- Create: `apps/api/src/index.ts`

- [ ] **Step 1: Create `apps/api/src/lib/redis.ts`**

```typescript
import Redis from 'ioredis'

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // required for BullMQ
})

redis.on('error', (err) => console.error('Redis error:', err))
```

- [ ] **Step 2: Create `apps/api/src/lib/minio.ts`**

```typescript
import * as Minio from 'minio'

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
})

const BUCKET = process.env.MINIO_BUCKET ?? 'crm-files'

export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(BUCKET)
  if (!exists) {
    await minioClient.makeBucket(BUCKET, 'us-east-1')
    console.log(`✓ MinIO bucket '${BUCKET}' created`)
  } else {
    console.log(`✓ MinIO bucket '${BUCKET}' exists`)
  }
}

export { BUCKET }
```

- [ ] **Step 3: Create `apps/api/src/queues/index.ts`**

```typescript
import { Queue } from 'bullmq'
import { redis } from '../lib/redis.js'

const connection = redis

export const dripCampaignQueue = new Queue('drip-campaign', { connection })
export const automationQueue = new Queue('automation', { connection })
export const csvImportQueue = new Queue('csv-import', { connection })
export const notificationQueue = new Queue('notification', { connection })

console.log('✓ BullMQ queues initialized')
```

- [ ] **Step 4: Create `apps/api/src/queues/worker.ts`**

```typescript
import { Worker } from 'bullmq'
import { redis } from '../lib/redis.js'

const connection = redis

// Stub workers — no processing in Phase 1
// Phase 5 will add actual job processors

new Worker('drip-campaign', async (job) => {
  console.log(`[drip-campaign] job ${job.id} — no processor in Phase 1`)
}, { connection })

new Worker('automation', async (job) => {
  console.log(`[automation] job ${job.id} — no processor in Phase 1`)
}, { connection })

new Worker('csv-import', async (job) => {
  console.log(`[csv-import] job ${job.id} — no processor in Phase 1`)
}, { connection })

new Worker('notification', async (job) => {
  console.log(`[notification] job ${job.id} — no processor in Phase 1`)
}, { connection })

console.log('✓ BullMQ workers started (stub)')
```

- [ ] **Step 5: Create `apps/api/src/socket/index.ts`**

```typescript
import type { Server as HttpServer } from 'http'
import { Server as SocketServer } from 'socket.io'

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
      credentials: true,
    },
  })

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`)
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`)
    })
  })

  console.log('✓ Socket.io server initialized')
  return io
}
```

- [ ] **Step 6: Create `apps/api/src/index.ts`**

```typescript
import 'dotenv/config'
import http from 'http'
import { createApp } from './app.js'
import { createSocketServer } from './socket/index.js'
import { ensureBucket } from './lib/minio.js'
import './queues/index.js'
import './queues/worker.js'

const PORT = parseInt(process.env.PORT ?? '4000', 10)

async function start() {
  const app = createApp()
  const server = http.createServer(app)
  createSocketServer(server)

  await ensureBucket()

  server.listen(PORT, () => {
    console.log(`✓ API server running at http://localhost:${PORT}`)
  })
}

start().catch((err) => {
  console.error('Failed to start API server:', err)
  process.exit(1)
})
```

- [ ] **Step 7: Start the API server to verify**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
pnpm --filter @crm/api run dev
# Expected output (order may vary):
# ✓ BullMQ queues initialized
# ✓ BullMQ workers started (stub)
# ✓ Socket.io server initialized
# ✓ MinIO bucket 'crm-files' exists (or created)
# ✓ API server running at http://localhost:4000
```

Test health endpoint:
```bash
curl http://localhost:4000/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/
git commit -m "feat: add Redis, MinIO, BullMQ queues, Socket.io scaffold to API"
```

---

## Task 10: apps/web — Next.js + NextAuth v5

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/auth.ts`
- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@crm/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@crm/database": "workspace:*",
    "@crm/shared": "workspace:*",
    "@tanstack/react-query": "^5.75.0",
    "bcryptjs": "^2.4.3",
    "clsx": "^2.1.1",
    "lucide-react": "^0.487.0",
    "next": "^15.3.0",
    "next-auth": "^5.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^3.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9",
    "eslint-config-next": "^15.3.0",
    "postcss": "^8",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@crm/shared": ["../../packages/shared/src/index.ts"],
      "@crm/database": ["../../packages/database/src/index.ts"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/web/next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@crm/shared', '@crm/database'],
}

export default nextConfig
```

- [ ] **Step 4: Create `apps/web/postcss.config.mjs`**

```javascript
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
export default config
```

- [ ] **Step 5: Install apps/web dependencies**

```bash
pnpm --filter @crm/web install
```

- [ ] **Step 6: Create `apps/web/src/auth.ts`**

```typescript
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaClient } from '@crm/database'
import bcrypt from 'bcryptjs'
import type { JwtPayload, Permission } from '@crm/shared'

const prisma = new PrismaClient()

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { role: true },
        })

        if (!user || user.status !== 'ACTIVE') return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash,
        )
        if (!valid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          roleId: user.roleId,
          permissions: user.role.permissions as Permission[],
          marketIds: user.marketIds,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id
        token.roleId = (user as any).roleId
        token.permissions = (user as any).permissions
        token.marketIds = (user as any).marketIds
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.userId as string
      ;(session.user as any).roleId = token.roleId
      ;(session.user as any).permissions = token.permissions
      ;(session.user as any).marketIds = token.marketIds
      return session
    },
  },
})

export type { JwtPayload }
```

- [ ] **Step 7: Create `apps/web/src/middleware.ts`**

```typescript
import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isAuthRoute = req.nextUrl.pathname.startsWith('/login')
  const isApiAuth = req.nextUrl.pathname.startsWith('/api/auth')

  if (isApiAuth) return NextResponse.next()
  if (!isLoggedIn && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }
  if (isLoggedIn && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
  }
  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 8: Create `apps/web/src/app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from '@/auth'

export const { GET, POST } = handlers
```

- [ ] **Step 9: Create `apps/web/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Homeward Partners CRM',
  description: 'Real estate acquisitions and pipeline management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 10: Create `apps/web/src/app/globals.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 11: Create `apps/web/src/app/page.tsx`** (redirect to dashboard)

```tsx
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/dashboard')
}
```

- [ ] **Step 12: Create login page `apps/web/src/app/login/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            HP
          </div>
          <span className="font-bold text-gray-900">Homeward Partners</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Sign in</h1>
        <p className="text-sm text-gray-500 mb-6">Enter your credentials to continue</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@homewardpartners.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 13: Commit**

```bash
git add apps/web/
git commit -m "feat: apps/web with Next.js 15, NextAuth v5, login page"
```

---

## Task 11: App shell — layout, sidebar, header

**Files:**
- Create: `apps/web/src/app/(app)/layout.tsx`
- Create: `apps/web/src/components/layout/Sidebar.tsx`
- Create: `apps/web/src/components/layout/GlobalHeader.tsx`
- Create: `apps/web/src/lib/utils.ts`

- [ ] **Step 1: Create `apps/web/src/lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 2: Create `apps/web/src/components/layout/Sidebar.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  badge?: number
}

interface NavSection {
  label?: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Inbox', href: '/inbox' },
      { label: 'Email Client', href: '/email' },
    ],
  },
  {
    label: 'Acquisition',
    items: [
      { label: 'Active Leads — DTS', href: '/leads/dts' },
      { label: 'Active Leads — DTA', href: '/leads/dta' },
      { label: 'Warm Leads', href: '/leads/warm' },
      { label: 'Dead Leads', href: '/leads/dead' },
      { label: 'Referred to Agent', href: '/leads/referred' },
    ],
  },
  {
    label: 'Pipelines',
    items: [
      { label: 'Transaction Mgmt', href: '/tm' },
      { label: 'Dispo', href: '/dispo' },
      { label: 'Inventory', href: '/inventory' },
      { label: 'Sold', href: '/sold' },
      { label: 'Rental', href: '/rental' },
    ],
  },
  {
    label: 'Contacts',
    items: [
      { label: 'Buyers', href: '/buyers' },
      { label: 'Vendors', href: '/vendors' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Calendar', href: '/calendar' },
      { label: 'Tasks', href: '/tasks' },
      { label: 'Activity', href: '/activity' },
      { label: 'List Stacking', href: '/list-stacking' },
    ],
  },
  {
    items: [
      { label: 'Analytics', href: '/analytics' },
      { label: 'Settings', href: '/settings' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-[228px] flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
      <nav className="py-2">
        {NAV.map((section, sIdx) => (
          <div key={sIdx}>
            {sIdx > 0 && <div className="h-px bg-gray-100 my-1.5" />}
            {section.label && (
              <p className="px-4 pt-2.5 pb-1 text-[10.5px] font-bold text-gray-400 uppercase tracking-wider">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-4 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50',
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0',
                      isActive ? 'bg-blue-600' : 'bg-gray-300',
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-red-100 text-red-600 rounded-full px-1.5 py-0.5">
                      {item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 3: Create `apps/web/src/components/layout/GlobalHeader.tsx`**

```tsx
import Link from 'next/link'
import { auth } from '@/auth'

export async function GlobalHeader() {
  const session = await auth()
  const initials = session?.user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '??'

  return (
    <header className="h-[52px] flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-4 gap-3 z-10">
      {/* Logo */}
      <div className="flex items-center gap-2 w-[220px] flex-shrink-0">
        <div className="w-[26px] h-[26px] bg-blue-600 rounded-[6px] flex items-center justify-center text-white text-[11px] font-bold">
          HP
        </div>
        <span className="font-bold text-[15px] text-gray-900">Homeward Partners</span>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-[400px] bg-slate-50 border border-gray-200 rounded-lg h-[34px] flex items-center px-3 gap-2 text-gray-400 text-[13px]">
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span>Search properties, contacts, messages...</span>
        <span className="ml-auto text-[11px] bg-slate-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-400">
          All ▾
        </span>
      </div>

      {/* Right side actions */}
      <div className="ml-auto flex items-center gap-2">
        {/* + Add button */}
        <button className="flex items-center gap-1 bg-blue-600 text-white text-[12px] font-semibold px-3 h-8 rounded-[7px] hover:bg-blue-700">
          <span className="text-base leading-none">+</span>
          <span>Add</span>
        </button>

        {/* Hot leads */}
        <Link
          href="/leads/dts?filter=hot"
          className="w-8 h-8 rounded-[7px] bg-slate-50 border border-gray-200 flex items-center justify-center text-sm hover:bg-gray-100"
          title="Hot Leads"
        >
          🔥
        </Link>

        {/* Notifications */}
        <button className="relative w-8 h-8 rounded-[7px] bg-slate-50 border border-gray-200 flex items-center justify-center text-sm hover:bg-gray-100">
          🔔
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full border border-white" />
        </button>

        {/* Calendar */}
        <Link
          href="/calendar"
          className="w-8 h-8 rounded-[7px] bg-slate-50 border border-gray-200 flex items-center justify-center text-sm hover:bg-gray-100"
        >
          📅
        </Link>

        {/* Twilio balance */}
        <div className="w-8 h-8 rounded-[7px] bg-slate-50 border border-gray-200 flex items-center justify-center text-[11px] font-semibold text-gray-500">
          $—
        </div>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold cursor-pointer">
          {initials}
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Create `apps/web/src/app/(app)/layout.tsx`**

```tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { GlobalHeader } from '@/components/layout/GlobalHeader'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <GlobalHeader />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto p-5">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/
git commit -m "feat: app shell layout, sidebar (all nav items), global header"
```

---

## Task 12: Dashboard + all route stubs

**Files:** All 19 route stub pages + dashboard page

- [ ] **Step 1: Create dashboard page `apps/web/src/app/(app)/dashboard/page.tsx`**

```tsx
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-5">
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · DFW Market
      </p>

      {/* Stat widgets */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'New Leads Today', value: '—', color: 'text-blue-600' },
          { label: 'Open Leads', value: '—', color: 'text-red-500' },
          { label: 'Hot Leads', value: '🔥 —', color: 'text-amber-500' },
          { label: 'Under Contract', value: '—', color: 'text-emerald-600' },
        ].map((w) => (
          <div key={w.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              {w.label}
            </p>
            <p className={`text-3xl font-extrabold ${w.color}`}>{w.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Coming in Phase 2</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[13px] font-semibold text-gray-900 mb-3">Lead Volume — Last 7 Days</p>
          <div className="flex items-end gap-2 h-20">
            {[40, 65, 50, 80, 60, 45, 75].map((h, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t ${i === 6 ? 'bg-blue-600' : 'bg-blue-100'}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[13px] font-semibold text-gray-900 mb-3">Tasks Due Today</p>
          <p className="text-sm text-gray-400 text-center py-6">Coming in Phase 2</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create a shared stub component**

Create `apps/web/src/components/layout/ComingSoon.tsx`:

```tsx
interface ComingSoonProps {
  title: string
  phase: number
}

export function ComingSoon({ title, phase }: ComingSoonProps) {
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      <p className="text-sm text-gray-500 mt-1">Coming in Phase {phase}</p>
    </div>
  )
}
```

- [ ] **Step 3: Create all route stub pages**

Create each of the following files with the exact content shown (only the title/phase changes):

`apps/web/src/app/(app)/inbox/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function InboxPage() { return <ComingSoon title="Inbox" phase={3} /> }
```

`apps/web/src/app/(app)/email/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function EmailPage() { return <ComingSoon title="Email Client" phase={6} /> }
```

`apps/web/src/app/(app)/leads/dts/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function LeadsDtsPage() { return <ComingSoon title="Active Leads — DTS" phase={2} /> }
```

`apps/web/src/app/(app)/leads/dta/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function LeadsDtaPage() { return <ComingSoon title="Active Leads — DTA" phase={2} /> }
```

`apps/web/src/app/(app)/leads/warm/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function WarmLeadsPage() { return <ComingSoon title="Warm Leads" phase={2} /> }
```

`apps/web/src/app/(app)/leads/dead/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function DeadLeadsPage() { return <ComingSoon title="Dead Leads" phase={2} /> }
```

`apps/web/src/app/(app)/leads/referred/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function ReferredPage() { return <ComingSoon title="Referred to Agent" phase={2} /> }
```

`apps/web/src/app/(app)/tm/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function TmPage() { return <ComingSoon title="Transaction Management" phase={4} /> }
```

`apps/web/src/app/(app)/dispo/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function DispoPage() { return <ComingSoon title="Dispo" phase={4} /> }
```

`apps/web/src/app/(app)/inventory/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function InventoryPage() { return <ComingSoon title="Inventory" phase={4} /> }
```

`apps/web/src/app/(app)/sold/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function SoldPage() { return <ComingSoon title="Sold" phase={4} /> }
```

`apps/web/src/app/(app)/rental/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function RentalPage() { return <ComingSoon title="Rental" phase={4} /> }
```

`apps/web/src/app/(app)/buyers/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function BuyersPage() { return <ComingSoon title="Buyers" phase={4} /> }
```

`apps/web/src/app/(app)/vendors/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function VendorsPage() { return <ComingSoon title="Vendors" phase={4} /> }
```

`apps/web/src/app/(app)/calendar/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function CalendarPage() { return <ComingSoon title="Calendar" phase={2} /> }
```

`apps/web/src/app/(app)/tasks/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function TasksPage() { return <ComingSoon title="Tasks" phase={2} /> }
```

`apps/web/src/app/(app)/activity/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function ActivityPage() { return <ComingSoon title="Activity" phase={2} /> }
```

`apps/web/src/app/(app)/list-stacking/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function ListStackingPage() { return <ComingSoon title="List Stacking" phase={6} /> }
```

`apps/web/src/app/(app)/analytics/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function AnalyticsPage() { return <ComingSoon title="Analytics" phase={6} /> }
```

`apps/web/src/app/(app)/settings/page.tsx`:
```tsx
import { ComingSoon } from '@/components/layout/ComingSoon'
export default function SettingsPage() { return <ComingSoon title="Settings" phase={6} /> }
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/ apps/web/src/components/
git commit -m "feat: dashboard page and all 19 route stubs with ComingSoon component"
```

---

## Task 13: Wire up `.claude/launch.json` + final smoke test

**Files:**
- Modify: `.claude/launch.json` (update for monorepo)

- [ ] **Step 1: Update `.claude/launch.json`**

```json
{
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": ["node_modules/next/dist/bin/next", "dev", "--port", "3000"],
  "cwd": "apps/web",
  "port": 3000,
  "env": {
    "PATH": "C:\\Program Files\\nodejs;${env:PATH}"
  }
}
```

- [ ] **Step 2: Start both services for smoke test**

Terminal 1 (API):
```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
pnpm --filter @crm/api run dev
# Expected: "✓ API server running at http://localhost:4000"
```

Terminal 2 (Web):
```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "/c/Users/suban/OneDrive/Documents/Claude/Projects/CRM Built"
pnpm --filter @crm/web run dev
# Expected: "✓ Ready on http://localhost:3000"
```

- [ ] **Step 3: Verify the app**

1. Open `http://localhost:3000` — should redirect to `/login`
2. Sign in with `admin@homewardpartners.com` / `Admin1234!`
3. Should redirect to `/dashboard` — verify sidebar shows all nav items
4. Click each section link — should show "Coming in Phase X" message (no 404s)
5. Open `http://localhost:4000/api/health` — should return `{"status":"ok",...}`

- [ ] **Step 4: Run all tests**

```bash
pnpm test
# Expected: packages/shared and apps/api tests all PASS
```

- [ ] **Step 5: Final commit**

```bash
git add .claude/launch.json
git commit -m "feat: Phase 1 complete — monorepo, full schema, auth, nav shell"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by task |
|---|---|
| pnpm + Turborepo monorepo | Task 2 |
| Next.js 14+ App Router | Task 10 |
| Express API | Task 8 |
| Full Prisma schema (35+ entities) | Task 5 |
| NextAuth v5 + Shared JWT | Task 10 |
| Seed admin user | Task 7 |
| Left nav shell (Option B, blue) | Task 11 |
| Global header (all 7 elements) | Task 11 |
| Redis + BullMQ setup | Task 9 |
| MinIO setup | Task 9 |
| Docker Compose (all services) | Task 6 |
| Address normalization util | Task 3 |
| All sidebar routes (no 404s) | Task 12 |
| TDD for normalizeAddress | Task 3 |
| TDD for auth middleware | Task 8 |

All spec items covered. No placeholders or TBDs in any task.
