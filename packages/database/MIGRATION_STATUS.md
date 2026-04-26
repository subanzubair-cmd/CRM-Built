# Prisma → Sequelize Migration Status

This branch (`sequelize_orm_changes`) contains the phased migration from
Prisma to `sequelize-typescript`. The migration plan lives at
`C:\Users\suban\.claude\plans\fancy-twirling-gosling.md`.

## What's done

### Phase 1 — Foundation (commit `136fa05c`)
- `sequelize-typescript` singleton at `packages/database/src/sequelize.ts`
  with separate connection pool (`application_name=crm-sequelize`).
- Umzug migration runner with bootstrap-from-Prisma-history. The two
  Prisma migrations are wrapped as Umzug TS migrations.
- Shadow Postgres on port 5433 (added to `docker-compose.yml`).
- `pnpm db:migrate:check` script + `compare-schemas.mjs` order-insensitive
  schema diff. Verified 243 structural objects identical between
  Prisma-managed main DB and Umzug-rebuilt shadow DB.
- 26 enums hand-typed in `enums.ts` (decoupled from Prisma codegen).
- Dual-export hub in `@crm/database` so callers get whatever's migrated
  without changing imports.
- 4/4 boot smoke tests pass.

### Phases 2–8 — Models migrated (57 model classes)
All 57 Sequelize-typescript model classes are defined, registered with
the singleton, and have their associations wired:

| Phase | Models | Commit |
|---|---|---|
| 2 — Leaves (9) | LeadSource, TwilioNumber, Tag, Market, AiConfiguration, GlobalFolder, GlobalFile, ListStackSource, CommProviderConfig | `4d548967` |
| 3 — User & RBAC (7) | User, Role, UserRoleConfig, ApiToken, UserCampaignAssignment, LeadCampaignRoleToggle, PropertyTeamAssignment | `83d1853b` |
| 4 — Campaigns & enrollment (10) | LeadCampaign, LeadCampaignUser, Campaign, CampaignStep, CampaignEnrollment, Automation, AutomationAction, StatusAutomation, Template, DirectMailCampaign | `82c5f7a3` |
| 5 — Contacts (4) | Contact, Buyer, BuyerCriteria, Vendor | `89f8b657` |
| 6 — Property hub (10) | Property, PropertyContact, StageHistory, ActivityLog, Note, Task, Appointment, BuyerMatch, BuyerOffer, LeadOffer | `93ff85d5` |
| 7 — Conversations (7) | Conversation, Message, ActiveCall, Notification, EsignTemplate, EsignDocument, PropertyFile | `9dfd75fe` |
| 8 — Logs & analytics (10) | AiLog, WebhookEvent, SavedFilter, FinancialGoal, FinancialAccount, FinancialTransaction, AccountTag, Webhook, CustomFormConfig, WebFormConfig | `eb0b4d34` |

Decimal columns get a per-column `get()` shim that coerces Postgres
NUMERIC strings to JS numbers so existing call sites can keep using
`.askingPrice + 1000` etc. without per-site `.toNumber()`.

### Application call sites migrated (clean ones)
- All 17 leads/inventory/tm/dispo/rental/sold pipeline pages — `User.findAll` swapped in.
- Settings pages: markets, tags, phone-numbers, twilio-numbers, list-stacking, global-files, ai-configurations, comm-provider-configs, templates, automations, status-automations.
- User & Role admin: users (POST/PATCH/DELETE), roles (CRUD), api-token, profile.
- Auth: `apps/web/src/auth.ts` Credentials provider + JWT callback.
- Calls: outbound `/api/calls`, supervisor `/coach`.
- Campaigns: campaigns (CRUD), campaigns/[id]/steps, campaigns/[id]/enroll, campaign-enrollments/[id], scheduled-sms/[id].
- Contacts: contact CRUD, vendors (CRUD), DnD checks (web + api).
- Lib helpers: settings.ts, contacts.ts, vendors.ts, dnd.ts, list-stacking.ts, campaigns.ts, notifications.ts, analytics.ts, layout/GlobalHeader.tsx.

### Verification
- 13/13 Sequelize boot tests pass (boots, authenticates, status, association resolution).
- `apps/web` `tsc --noEmit` clean across all phases.
- `pnpm db:migrate:check` confirms shadow ≡ main DB structurally (243 objects).
- Dev server boots in 4–6 seconds; representative routes from each phase return 307 (auth redirect — proves Sequelize models load + the dual-export hub resolves).

## What's still on Prisma (intentional)

Both ORMs see the same Postgres tables. The following call sites mix
Property + Task + Message + LeadCampaign in transactions or use Prisma's
nested relation filters (`where: { property: { leadCampaignId } }`).
They keep working because Prisma's view of all tables is intact.

### Heavy multi-cluster transactions
- `apps/web/src/app/api/leads/route.ts` — 3-level nested create (Property + PropertyContact + Contact + StageHistory + ActivityLog); the plan calls out `createLeadGraph` as a Phase 6 helper.
- `apps/web/src/app/api/leads/[id]/route.ts` — `prisma.$transaction` array form for stage transitions + side-effects.
- `apps/web/src/app/api/leads/[id]/team/route.ts` — team backfill that reads PropertyTeamAssignment + Role + Property in one query.
- `apps/web/src/app/api/leads/[id]/change-campaign{,-preview}/route.ts` — multi-step team migration on campaign change.
- `apps/web/src/app/api/users/[id]/role-configs/route.ts` — large transaction reassigning PropertyTeamAssignment + Property.assignedToId + Task.assignedToId.
- `apps/web/src/app/api/users/[id]/delete-with-reassignments/route.ts`
- `apps/web/src/app/api/users/[id]/campaigns/{,backfill}/route.ts`
- `apps/web/src/app/api/users/[id]/access-revocation-impact/route.ts`

### Pipeline lib helpers
- `apps/web/src/lib/team-assignment.ts` — autoPopulateTeamForCampaign uses Prisma's relation filter for property scope.
- `apps/web/src/lib/lead-assignment.ts` — pickAssigneeForNewLead similarly relies on relation filters.
- `apps/web/src/lib/buyers.ts` — getBuyerList / getBuyerById with deep includes.
- `apps/web/src/lib/buyer-matching.ts` — match generator across Buyer + BuyerCriteria + Property.
- `apps/web/src/lib/inbox.ts` — Conversation/Message threading with Property includes.
- `apps/web/src/lib/analytics.ts` — most aggregations (only User list ported).

### API routes
- `apps/web/src/app/api/buyers/{route,[id],blast,convert}/...`
- `apps/web/src/app/api/buyers/[id]/criteria/route.ts`
- `apps/web/src/app/api/messages/route.ts`
- `apps/web/src/app/api/calls/inbound/lookup/route.ts`
- `apps/web/src/app/api/scheduled-sends/route.ts`
- `apps/web/src/app/api/scheduled-sms/route.ts` (GET — list with includes; PATCH was ported)
- `apps/web/src/app/api/search/route.ts`

### apps/api workers
- `apps/api/src/lib/automation-runner.ts`
- `apps/api/src/lib/drip-executor.ts`
- `apps/api/src/lib/imap-worker.ts`
- `apps/api/src/queues/worker.ts`
- `apps/api/src/routes/webhooks.ts` (TwilioNumber lookup ported; Conversation/Message stays on Prisma)

## Phase 9 — Standalone scripts

**Decision: scripts stay on Prisma.** Per the plan: "The 15 `/scripts/*.mjs`
one-shots — keep on Prisma. They run rarely, were written against a
known schema state, and rewriting yields zero user-facing value."

Active scripts (`seed-leads`, `seed-dts-dta-leads`, `seed-all-pipelines`,
`demo-seed`, `seed-comm-provider`, `seed-lead-sources`) continue to
import directly from `../packages/database/node_modules/.prisma/client/`
and work against the live DB. No change.

## Phase 10 — Decommission status

**Cannot fully decommission Prisma yet.** The remaining call sites
listed under "What's still on Prisma" actively use `prisma.<model>.X()`
APIs against tables (Property, Task, Message, etc.) whose Sequelize
models *exist* but whose call sites haven't been ported. Removing
`@prisma/client` would break those files immediately.

**The dual-export remains in place.** `@crm/database` continues to
export `PrismaClient`, `Prisma`, the Sequelize singleton, all 57
Sequelize model classes, the helpers, and the enums. Both ORMs work
side-by-side against the same database.

**Path to full decommission** (incremental, post-this-PR):
1. Pick a heavy-mixer file from the list above.
2. Migrate its `prisma.X` calls to the corresponding Sequelize model.
3. For Prisma's nested relation filters (`where: { property: { ... } }`),
   either split into two queries or use Sequelize `include.where + required: true`
   (see `apps/web/src/lib/vendors.ts` for the pattern).
4. For Prisma's `$transaction(async tx => ...)`, use
   `sequelize.transaction(async t => ...)`.
5. When `grep -rE "from '@crm/database'.*PrismaClient" apps packages | grep -v models | grep -v dual-export` returns zero results, drop `@prisma/client` from `packages/database/package.json`, remove the Prisma re-export from `packages/database/src/index.ts`, delete `packages/database/prisma/migrations/` (or keep it as a sealed historical artifact), and remove `prisma migrate dev` from package.json scripts.

## Running the migrations on a fresh environment

```bash
# Start the DBs.
docker compose up -d postgres postgres-shadow

# Apply Umzug migrations (auto-skips on Prisma-already-applied envs).
DATABASE_URL=postgresql://crm_user:crm_password@localhost:5432/rei_crm?schema=public \
  pnpm db:migrate:sequelize:up

# Verify shadow ≡ main schema.
pnpm db:migrate:check

# Run boot tests.
DATABASE_URL=... pnpm --filter @crm/database test
```

## Remaining work (estimate)

The plan estimated 198–298 hours total for the full migration. Phases 1–8
(model definitions + clean call site migration) covered roughly 80–120
hours of that. The deferred call sites (heavy mixers + workers) are the
remaining 60–100 hours and are independently mergeable cluster-by-cluster
on this same branch.
