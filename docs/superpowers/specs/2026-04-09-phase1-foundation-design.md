# Phase 1 — Foundation: Monorepo, Auth, Database, Navigation Shell

**Date:** 2026-04-09  
**Status:** Approved — implementing next  
**Project:** Homeward Partners CRM  
**Spec refs:** v3.0 (master), v2 (appendices/data model)

---

## 1. Overview

Phase 1 establishes every foundation layer the remaining five phases build on. Nothing in Phase 2–6 can be implemented before this phase is complete. The output of Phase 1 is a running monorepo with: a database fully migrated to the final schema, a working auth flow seeding one admin user, a navigation shell with all sidebar items, the global header, Docker Compose with all services, address normalization utility, and a BullMQ+Redis+MinIO scaffold ready for feature use.

**No feature logic is built in Phase 1.** Every dashboard shows "Coming soon" or an empty state. The value of Phase 1 is the skeleton — correct structure, correct schema, correct auth wiring.

---

## 2. Monorepo Structure

Wipe the current Next.js scaffold in the root. Rebuild from scratch as a pnpm Turborepo monorepo.

```
/                          ← repo root
├── apps/
│   ├── web/               ← Next.js 14 App Router (port 3000)
│   └── api/               ← Express (port 4000)
├── packages/
│   ├── database/          ← Prisma schema + client + seed
│   └── shared/            ← TypeScript types, Zod schemas, constants, normalizeAddress
├── docker-compose.yml     ← PostgreSQL 16, Redis 7, MinIO
├── turbo.json
├── pnpm-workspace.yaml
└── package.json           ← root workspace (no code, only scripts + devDeps)
```

### Root `package.json` scripts
```json
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "db:migrate": "turbo run db:migrate --filter=@crm/database",
    "db:seed": "turbo run db:seed --filter=@crm/database",
    "db:studio": "turbo run db:studio --filter=@crm/database"
  }
}
```

### `turbo.json` pipelines
- `dev`: persistent, no cache
- `build`: depends on `^build`
- `db:migrate`, `db:seed`: no cache, no deps

### Package names (internal)
- `@crm/web`, `@crm/api`, `@crm/database`, `@crm/shared`

---

## 3. Infrastructure — Docker Compose

All services in `docker-compose.yml`. The `.env` at the repo root drives all connection strings.

### Services

| Service | Image | Port | Credentials |
|---------|-------|------|-------------|
| PostgreSQL | postgres:16-alpine | 5432 | crm_user / crm_password / rei_crm |
| Redis | redis:7-alpine | 6379 | no auth in dev |
| MinIO | minio/minio:latest | 9000 (S3 API) / 9001 (console) | minioadmin / minioadmin |

### Environment variables (`.env`)
```
# Database
DATABASE_URL="postgresql://crm_user:crm_password@localhost:5432/rei_crm?schema=public"

# Auth
AUTH_SECRET="<generated 32-char secret>"   # used by both apps/web AND apps/api
NEXTAUTH_URL="http://localhost:3000"

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
API_INTERNAL_SECRET="<generated 32-char secret>"
```

MinIO bucket `crm-files` is created automatically on first API startup via a startup script.

---

## 4. `packages/database` — Prisma Schema

The full schema is defined in Phase 1. All 35+ entities are migrated now so Phase 2–6 only ADD data, never restructure core tables. Enum values and FK relationships are locked per v3.0 spec.

### Enums

```prisma
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
```

### Core Models

```prisma
model User {
  id          String     @id @default(cuid())
  email       String     @unique
  name        String
  phone       String?
  avatarUrl   String?
  status      UserStatus @default(ACTIVE)
  roleId      String
  role        Role       @relation(fields: [roleId], references: [id])
  marketIds   String[]   // array of Market IDs this user can access
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  // Relations
  assignedProperties Property[]      @relation("AssignedTo")
  createdProperties  Property[]      @relation("CreatedBy")
  tasks              Task[]          @relation("AssignedToUser")
  createdTasks       Task[]          @relation("CreatedByUser")
  messages           Message[]       @relation("SentBy")
  activityLogs       ActivityLog[]
  notifications      Notification[]
  savedFilters       SavedFilter[]
}

model Role {
  id          String   @id @default(cuid())
  name        String   @unique
  description String?
  permissions String[] // array of permission keys
  isSystem    Boolean  @default(false) // true for built-in roles
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  users User[]
}

model Market {
  id         String   @id @default(cuid())
  name       String   @unique  // e.g. "DFW", "Houston", "Austin", "San Antonio"
  state      String   @default("TX")
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  properties Property[]
  campaigns  Campaign[]
}

model Property {
  id                String         @id @default(cuid())
  // Address fields — all optional (no-address leads supported)
  streetAddress     String?
  city              String?
  state             String?
  zip               String?
  county            String?
  normalizedAddress String?        // output of normalizeAddress(), used for dedup
  // Property details
  bedrooms          Int?
  bathrooms         Decimal?
  sqft              Int?
  yearBuilt         Int?
  lotSize           Decimal?
  propertyType      String?        // Single Family, Multi-Family, Land, Commercial
  // Lead info
  leadType          LeadType
  leadStatus        LeadStatus     @default(ACTIVE)
  propertyStatus    PropertyStatus @default(LEAD)
  activeLeadStage   ActiveLeadStage? // null when not in active leads
  exitStrategy      ExitStrategy?
  isHot             Boolean        @default(false)
  isFavorited       Boolean        @default(false)
  isOpen            Boolean        @default(true)
  // Financial
  askingPrice       Decimal?
  offerPrice        Decimal?
  arv               Decimal?
  repairEstimate    Decimal?
  // Pipeline refs
  tmStage           TmStage?
  inventoryStage    InventoryStage?
  inDispo           Boolean        @default(false)
  soldAt            DateTime?
  rentalAt          DateTime?
  // Routing
  marketId          String
  market            Market         @relation(fields: [marketId], references: [id])
  assignedToId      String?
  assignedTo        User?          @relation("AssignedTo", fields: [assignedToId], references: [id])
  createdById       String
  createdBy         User           @relation("CreatedBy", fields: [createdById], references: [id])
  // Source tracking
  source            String?        // batch list, website, referral, etc.
  campaignName      String?
  tags              String[]
  // Timestamps
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
  contractDate      DateTime?

  // Relations
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

  @@unique([normalizedAddress], map: "unique_normalized_address_when_not_null")
}

model Contact {
  id          String      @id @default(cuid())
  type        ContactType
  firstName   String
  lastName    String?
  email       String?
  phone       String?
  phone2      String?
  address     String?
  city        String?
  state       String?
  zip         String?
  notes       String?
  tags        String[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

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
  role       String?  // "seller", "co-owner", "spouse", "heir"
  createdAt  DateTime @default(now())

  @@unique([propertyId, contactId])
}

model StageHistory {
  id           String    @id @default(cuid())
  propertyId   String
  property     Property  @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  pipeline     String    // "LEADS", "TM", "INVENTORY", "SOLD", "RENTAL"
  fromStage    String?
  toStage      String
  changedById  String?
  changedByName String?
  reason       String?
  createdAt    DateTime  @default(now())
}
```

### Communication Models

```prisma
model Conversation {
  id           String   @id @default(cuid())
  propertyId   String
  property     Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  contactPhone String?
  contactEmail String?
  isRead       Boolean  @default(false)
  lastMessageAt DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

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
  subject        String?          // for email
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
```

### Task / Calendar Models

```prisma
model Task {
  id           String     @id @default(cuid())
  propertyId   String?
  property     Property?  @relation(fields: [propertyId], references: [id])
  title        String
  description  String?
  type         TaskType   @default(OTHER)
  status       TaskStatus @default(PENDING)
  priority     Int        @default(0) // 0=normal, 1=high, 2=urgent
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
  id           String   @id @default(cuid())
  propertyId   String
  property     Property @relation(fields: [propertyId], references: [id])
  title        String
  description  String?
  startAt      DateTime
  endAt        DateTime
  location     String?
  attendees    String[]  // user IDs
  googleEventId String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

### Campaign / Automation Models

```prisma
model Campaign {
  id          String         @id @default(cuid())
  name        String
  type        CampaignType
  status      CampaignStatus @default(DRAFT)
  description String?
  marketId    String?
  market      Market?        @relation(fields: [marketId], references: [id])
  tags        String[]       // filter — only enroll leads with these tags
  leadTypes   LeadType[]     // DTS, DTA, or both
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  steps       CampaignStep[]
  enrollments CampaignEnrollment[]
}

model CampaignStep {
  id          String         @id @default(cuid())
  campaignId  String
  campaign    Campaign       @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  order       Int
  delayDays   Int            @default(0)
  delayHours  Int            @default(0)
  channel     MessageChannel
  subject     String?        // email subject
  body        String
  isActive    Boolean        @default(true)
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
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
  id          String               @id @default(cuid())
  name        String
  description String?
  trigger     AutomationTrigger
  conditions  Json                 @default("{}") // flexible condition object
  isActive    Boolean              @default(true)
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt

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
```

### Buyer / Vendor Models

```prisma
model Buyer {
  id          String   @id @default(cuid())
  contactId   String   @unique
  contact     Contact  @relation(fields: [contactId], references: [id])
  isActive    Boolean  @default(true)
  preferredMarkets String[]
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  criteria    BuyerCriteria[]
  matches     BuyerMatch[]
  offers      BuyerOffer[]
}

model BuyerCriteria {
  id              String   @id @default(cuid())
  buyerId         String
  buyer           Buyer    @relation(fields: [buyerId], references: [id], onDelete: Cascade)
  markets         String[]
  propertyTypes   String[]
  minBeds         Int?
  maxBeds         Int?
  minBaths        Decimal?
  maxBaths        Decimal?
  minPrice        Decimal?
  maxPrice        Decimal?
  minSqft         Int?
  maxSqft         Int?
  minArv          Decimal?
  maxArv          Decimal?
  maxRepairs      Decimal?
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
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
  id           String   @id @default(cuid())
  propertyId   String
  property     Property @relation(fields: [propertyId], references: [id])
  buyerId      String
  buyer        Buyer    @relation(fields: [buyerId], references: [id])
  offerAmount  Decimal
  status       String   @default("PENDING") // PENDING, ACCEPTED, REJECTED, COUNTERED
  notes        String?
  submittedAt  DateTime @default(now())
  respondedAt  DateTime?
  updatedAt    DateTime @updatedAt
}

model Vendor {
  id          String   @id @default(cuid())
  contactId   String   @unique
  contact     Contact  @relation(fields: [contactId], references: [id])
  category    String   // plumber, electrician, inspector, title, etc.
  isActive    Boolean  @default(true)
  markets     String[]
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### File / Document Models

```prisma
model PropertyFile {
  id          String   @id @default(cuid())
  propertyId  String
  property    Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  type        FileType @default(OTHER)
  name        String
  mimeType    String
  size        Int
  storageKey  String   // MinIO object key
  url         String?  // signed URL (not stored long-term)
  uploadedById String?
  uploadedByName String?
  createdAt   DateTime @default(now())
}

model EsignDocument {
  id           String   @id @default(cuid())
  propertyId   String
  name         String
  providerRef  String?  // external e-sign provider reference ID
  status       String   @default("DRAFT")
  signedAt     DateTime?
  storageKey   String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### Notification / Activity Models

```prisma
model Notification {
  id          String           @id @default(cuid())
  userId      String
  user        User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  type        NotificationType
  title       String
  body        String?
  propertyId  String?
  isRead      Boolean          @default(false)
  readAt      DateTime?
  createdAt   DateTime         @default(now())
}

model ActivityLog {
  id          String   @id @default(cuid())
  propertyId  String?
  property    Property? @relation(fields: [propertyId], references: [id])
  userId      String?
  user        User?    @relation(fields: [userId], references: [id])
  userName    String?
  action      String   // "STAGE_CHANGE", "MESSAGE_SENT", "TASK_CREATED", etc.
  detail      Json     @default("{}")
  createdAt   DateTime @default(now())
}
```

### Analytics / Saved Filters / AI / Webhooks

```prisma
model SavedFilter {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name        String
  pipeline    String    // "ACTIVE_LEADS_DTS", "ACTIVE_LEADS_DTA", "WARM", etc.
  filters     Json      // serialized filter state object
  isDefault   Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([userId, name, pipeline])
}

model AiLog {
  id          String   @id @default(cuid())
  propertyId  String?
  property    Property? @relation(fields: [propertyId], references: [id])
  engine      AiEngine
  input       Json
  output      Json
  tokens      Int?
  latencyMs   Int?
  reviewed    Boolean  @default(false)
  reviewedAt  DateTime?
  reviewedById String?
  createdAt   DateTime @default(now())
}

model WebhookEvent {
  id          String             @id @default(cuid())
  source      String             // "twilio", "sendgrid", "docusign", etc.
  eventType   String
  payload     Json
  status      WebhookEventStatus @default(PENDING)
  processedAt DateTime?
  error       String?
  createdAt   DateTime           @default(now())
}

model TwilioNumber {
  id          String   @id @default(cuid())
  number      String   @unique
  friendlyName String?
  marketId    String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
}

model ListStackSource {
  id          String   @id @default(cuid())
  name        String
  description String?
  tags        String[] // tags auto-applied to imported leads
  totalImported Int    @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### Partial Unique Index for Address Dedup

Applied via a Prisma migration raw SQL step after the main migration:

```sql
CREATE UNIQUE INDEX unique_normalized_address_when_not_null
ON "Property" ("normalizedAddress")
WHERE "normalizedAddress" IS NOT NULL;
```

---

## 5. `packages/shared` — Shared Utilities

### `normalizeAddress(input)`

Deterministic, no external API dependencies. Produces a lowercase canonical string used for dedup.

**Rules:**
1. Lowercase everything
2. Trim and collapse whitespace
3. Expand common abbreviations: `st` → `street`, `ave` → `avenue`, `blvd` → `boulevard`, `dr` → `drive`, `rd` → `road`, `ln` → `lane`, `ct` → `court`, `pl` → `place`, `hwy` → `highway`
4. Remove punctuation (periods, commas, hashes except in unit numbers)
5. Normalize unit designators: `apt`, `unit`, `#`, `suite`, `ste` → `unit`
6. Normalize directionals: `n` → `north`, `s` → `south`, `e` → `east`, `w` → `west`, `ne/nw/se/sw` expanded
7. Strip trailing zip+4 suffix (keep 5-digit zip only)
8. Output format: `{number} {street} {suffix} {unit?}, {city}, {state} {zip}`

Returns `null` if no street address is provided (no-address leads).

**Example:**
- Input: `"123 N. Oak St., Apt. 4B, Dallas, TX 75201-1234"`
- Output: `"123 north oak street unit 4b, dallas, tx 75201"`

### Zod Schemas (exported for both apps)

- `PropertyCreateSchema` — validates new property/lead form
- `ContactSchema` — validates contact upsert
- `UserSchema` — validates user create/update
- `TaskSchema`, `AppointmentSchema`
- `FilterStateSchema` — validates serialized filter objects
- `CampaignStepSchema`, `AutomationSchema`

### TypeScript Types

All Prisma-generated types re-exported from `@crm/database` are available via `@crm/shared`. Additional utility types:

```typescript
type Permission =
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
  | 'admin.all';

type JwtPayload = {
  userId: string;
  email: string;
  name: string;
  roleId: string;
  permissions: Permission[];
  marketIds: string[];
};
```

---

## 6. Auth — NextAuth v5 + Shared JWT

### Strategy

- NextAuth v5 (Auth.js) in `apps/web` handles login/session for the UI
- `apps/api` (Express) validates the same JWT using the shared `AUTH_SECRET`
- Strategy: JWT (no DB sessions) — token lives in httpOnly cookie on the browser
- Token payload: `JwtPayload` (see above)

### Credential Provider

Phase 1 uses Credentials provider only (email + password). OAuth is not in scope.

- Passwords hashed with bcrypt (12 rounds)
- Login: POST `/auth/signin` (handled by NextAuth)
- On login, the full `JwtPayload` is assembled from the DB and embedded in the JWT

### API Auth Middleware (`apps/api`)

```typescript
// middleware/auth.ts
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const token = extractToken(req); // from Authorization: Bearer <token> or cookie
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.AUTH_SECRET!) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requirePermission(permission: Permission) {
  return (req, res, next) => {
    if (!req.user?.permissions.includes(permission) && !req.user?.permissions.includes('admin.all')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
```

### Seed Admin User

Script: `packages/database/src/seed.ts`

Creates (or upserts) one `Role` named "Super Admin" with `permissions: ['admin.all']` and one `User`:

```
email:    admin@homewardpartners.com
password: Admin1234!   (← must be changed on first login)
name:     Admin
role:     Super Admin
marketIds: []          (empty array = access to all markets; enforced at query level)
```

Seed is idempotent — safe to re-run.

---

## 7. `apps/web` — Navigation Shell

### Layout

`apps/web/src/app/(app)/layout.tsx` — the authenticated app shell. Renders:
1. `<GlobalHeader />` (top bar, full width)
2. `<Sidebar />` (left, fixed width 228px)
3. `<main>` (content area, flex-1, scrollable)

All pages under `(app)/` require auth. The root route `/` redirects to `/dashboard`.

### Sidebar — Option B (Notion-style, blue accent)

Design confirmed: white background, grouped sections with uppercase labels, filled active state (`bg-[#eff6ff] text-[#1d4ed8]`), dot indicators, badge counts.

Accent color: **`#2563eb`** (blue-600)

```
Navigation items (in order):
────────────────────────
  Dashboard
  Inbox          [badge: unread count]
  Email Client
────────────────────────
  ACQUISITION
  Active Leads — DTS   [badge: count]
  Active Leads — DTA   [badge: count]
  Warm Leads
  Dead Leads
  Referred to Agent
────────────────────────
  PIPELINES
  Transaction Mgmt
  Dispo
  Inventory
  Sold
  Rental
────────────────────────
  CONTACTS
  Buyers
  Vendors
────────────────────────
  TOOLS
  Calendar
  Tasks              [badge: due today count]
  Activity
  List Stacking
────────────────────────
  Analytics
  Settings
```

Routes:
- `/dashboard`
- `/inbox`, `/email`
- `/leads/dts`, `/leads/dta`, `/leads/warm`, `/leads/dead`, `/leads/referred`
- `/tm`, `/dispo`, `/inventory`, `/sold`, `/rental`
- `/buyers`, `/vendors`
- `/calendar`, `/tasks`, `/activity`, `/list-stacking`
- `/analytics`, `/settings`

Each route renders a placeholder page in Phase 1: page title + "Coming in Phase X" message.

### Global Header

```
[HP logo icon] Homeward Partners | [Search bar — "Search properties, contacts, messages... All▾"] | [+ Add ▾] [🔥 Hot] [🔔 notif●] [📅 cal] [$42.10 balance] [JD avatar]
```

- **`+ Add` button**: dropdown — "New Lead", "New Task", "New Contact" (all routes to forms in Phase 2+)
- **Hot Leads (🔥)**: badge count of `isHot=true` properties; links to `/leads/dts?filter=hot`
- **Notifications bell**: unread count dot; links to notifications drawer
- **Twilio balance**: real balance fetched from Twilio API (requires `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`); shows "$—" if not configured
- **Calendar (📅)**: links to `/calendar`
- **Avatar**: user initials; dropdown — "Profile", "Settings", "Sign out"
- **Search bar**: global search (Phase 3+); shows `All ▾` scope selector (Properties, Contacts, Messages)

---

## 8. `apps/api` — Express Scaffold

Phase 1 sets up the Express app structure. No feature routes are implemented yet.

### Directory structure

```
apps/api/src/
├── index.ts         ← app entry point, starts HTTP + Socket.io server
├── app.ts           ← Express app setup (middleware, routes, error handler)
├── middleware/
│   ├── auth.ts      ← requireAuth, requirePermission
│   └── error.ts     ← global error handler
├── routes/
│   └── index.ts     ← mounts all routers (stubs in Phase 1)
├── queues/
│   ├── index.ts     ← BullMQ queue definitions
│   └── worker.ts    ← worker stub (processes no jobs in Phase 1)
├── socket/
│   └── index.ts     ← Socket.io setup (no events in Phase 1)
└── lib/
    ├── minio.ts     ← MinIO client + ensureBucket() on startup
    ├── redis.ts     ← Redis connection
    └── prisma.ts    ← Prisma client singleton
```

### Startup sequence

1. Connect to PostgreSQL (via Prisma)
2. Connect to Redis
3. Connect to MinIO, run `ensureBucket('crm-files')`
4. Start BullMQ worker
5. Start HTTP server on `process.env.PORT || 4000`
6. Attach Socket.io to HTTP server

### BullMQ Queues (defined, no workers yet)

- `drip-campaign` — processes campaign step sends
- `automation` — processes automation action triggers
- `csv-import` — processes bulk lead CSV imports
- `notification` — sends push/in-app notifications

---

## 9. Routing / Page Shell (Phase 1 stubs)

Every sidebar route renders a minimal page component:

```tsx
// Example: apps/web/src/app/(app)/leads/dts/page.tsx
export default function ActiveLeadsDtsPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Active Leads — DTS</h1>
      <p className="text-sm text-gray-500 mt-1">Coming in Phase 2</p>
    </div>
  );
}
```

Dashboard (`/dashboard`) shows the confirmed mockup widgets: 4 stat cards, lead volume bar chart, tasks due today list — all with hardcoded placeholder data in Phase 1.

---

## 10. Phase 1 Deliverables Checklist

| # | Deliverable | Notes |
|---|-------------|-------|
| 1 | pnpm + Turborepo monorepo initialized | 4 packages/apps |
| 2 | Docker Compose running (PG + Redis + MinIO) | All services healthy |
| 3 | Full Prisma schema migrated | 35+ models, all enums |
| 4 | Partial unique index on normalizedAddress | SQL migration step |
| 5 | NextAuth v5 wired in apps/web | JWT strategy |
| 6 | API auth middleware | requireAuth + requirePermission |
| 7 | Shared JWT_SECRET (AUTH_SECRET) | Same secret in both apps |
| 8 | Seed script creates admin user | Idempotent |
| 9 | normalizeAddress() utility | In packages/shared |
| 10 | Zod schemas + TypeScript types | In packages/shared |
| 11 | Navigation shell with all 20 sidebar items | Option B, blue accent |
| 12 | Global header with all 7 elements | + Add, hot, notif, cal, balance, avatar |
| 13 | All sidebar routes render stub pages | No "404" errors |
| 14 | Dashboard renders placeholder widgets | Blue accent, hardcoded data |
| 15 | Express app scaffold + all queue definitions | Starts cleanly |
| 16 | MinIO bucket auto-created on API start | crm-files bucket |
| 17 | BullMQ worker stub running | No jobs processed |
| 18 | `npm run dev` (turbo) starts both apps | web:3000, api:4000 |

---

## 11. Out of Scope for Phase 1

These are explicitly NOT in Phase 1:
- Any lead CRUD, property forms, or filters (Phase 2)
- User creation UI (Phase 2)
- Communications/Twilio wiring (Phase 3)
- TM/Inventory/Dispo/Sold/Rental feature pages (Phase 4)
- AI engines (Phase 5)
- Analytics dashboards, full admin (Phase 6)
- Real data in any dashboard widget
- Google Calendar sync
- Webhook event processing
