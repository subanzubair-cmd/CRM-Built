import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import {
  Property,
  ActivityLog,
  StageHistory,
  Note,
  Task,
  Message,
  PropertyContact,
  PropertyFile,
  BuyerMatch,
  BuyerOffer,
  CampaignEnrollment,
  Conversation,
  EsignDocument,
  LeadCampaign,
  Contact,
  sequelize,
} from '@crm/database'
import { z } from 'zod'
import { emitEvent, DomainEvents } from '@/lib/domain-events'
import { reEvaluateTeam } from '@/lib/team-assignment'
import { runStatusAutomations } from '@/lib/status-automation'
import { enqueueAutomation } from '@/lib/queue'
import { rateLimitMutation } from '@/lib/rate-limit'

// Route A exits → IN_TM + inDispo=true (simultaneous TM + Dispo)
const ROUTE_A_EXITS = ['WHOLESALE_ASSIGNMENT', 'WHOLESALE_DOUBLE_CLOSE', 'INSTALLMENT', 'SELLER_FINANCE']
// Route C exits → IN_TM only (later can go to Rental)
const ROUTE_C_EXITS = ['RENTAL', 'TURNKEY']
// Route B exits → everything else → IN_TM only (later can go to Inventory)

const UpdateLeadSchema = z.object({
  activeLeadStage: z.string().nullable().optional(),
  leadStatus: z.enum(['ACTIVE', 'WARM', 'DEAD', 'REFERRED_TO_AGENT']).optional(),
  propertyStatus: z.enum(['LEAD','UNDER_CONTRACT','IN_TM','IN_INVENTORY','IN_DISPO','SOLD','RENTAL','DEAD','WARM','REFERRED']).optional(),
  tmStage: z.string().nullable().optional(),
  inventoryStage: z.string().nullable().optional(),
  inDispo: z.boolean().optional(),
  contractDate: z.string().nullable().optional(),
  soldAt: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  isHot: z.boolean().optional(),
  isFavorited: z.boolean().optional(),
  askingPrice: z.number().nullable().optional(),
  offerPrice: z.number().nullable().optional(),
  arv: z.number().nullable().optional(),
  repairEstimate: z.number().nullable().optional(),
  exitStrategy: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  leadCampaignId: z.string().nullable().optional(),
  defaultOutboundNumber: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  bedrooms: z.number().int().nullable().optional(),
  bathrooms: z.number().nullable().optional(),
  sqft: z.number().int().nullable().optional(),
  yearBuilt: z.number().int().nullable().optional(),
  lotSize: z.number().nullable().optional(),
  propertyType: z.string().max(100).nullable().optional(),
  // Under Contract modal fields
  offerType: z.enum(['VERBAL', 'WRITTEN']).nullable().optional(),
  offerDate: z.string().nullable().optional(),
  expectedProfit: z.number().nullable().optional(),
  expectedProfitDate: z.string().nullable().optional(),
  contractPrice: z.number().nullable().optional(),
  scheduledClosingDate: z.string().nullable().optional(),
  contingencies: z.string().nullable().optional(),
  soldPrice: z.number().nullable().optional(),
  leadType: z.enum(['DIRECT_TO_SELLER', 'DIRECT_TO_AGENT']).optional(),
  deadAt: z.null().optional(),
  warmAt: z.null().optional(),
  referredAt: z.null().optional(),
  // Captured by DeadLeadReasonModal when leadStatus → DEAD. Reasons are
  // preset codes (the modal's checkbox keys); deadOtherReason is the
  // verbatim free-text from the "Other Reasons" textarea. Both pass
  // through to ActivityLog.detail and to the lead detail page section.
  deadReasons: z.array(z.string()).optional(),
  deadOtherReason: z.string().nullable().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const property = await Property.findByPk(id, {
    attributes: [
      'id', 'contractPrice', 'offerPrice', 'askingPrice', 'expectedProfit',
      'exitStrategy', 'propertyStatus', 'offerType', 'offerDate',
      'expectedProfitDate', 'contractDate', 'scheduledClosingDate', 'contingencies',
    ],
    raw: true,
  }) as any
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    data: {
      ...property,
      contractPrice: property.contractPrice ? Number(property.contractPrice) : null,
      offerPrice: property.offerPrice ? Number(property.offerPrice) : null,
      askingPrice: property.askingPrice ? Number(property.askingPrice) : null,
      expectedProfit: property.expectedProfit ? Number(property.expectedProfit) : null,
      offerDate: property.offerDate ? new Date(property.offerDate).toISOString() : null,
      expectedProfitDate: property.expectedProfitDate ? new Date(property.expectedProfitDate).toISOString() : null,
      contractDate: property.contractDate ? new Date(property.contractDate).toISOString() : null,
      scheduledClosingDate: property.scheduledClosingDate ? new Date(property.scheduledClosingDate).toISOString() : null,
    },
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const limited = rateLimitMutation(req, { bucket: 'leads.patch', limit: 600 })
  if (limited) return limited
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny
  const sessionUser = (session as any)?.user ?? {}
  const userId = sessionUser.id as string
  const userName = (sessionUser.name ?? 'Unknown') as string

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateLeadSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const existing = await Property.findByPk(id, {
    attributes: [
      'activeLeadStage', 'leadStatus', 'propertyStatus', 'tmStage', 'inventoryStage',
      'tags', 'leadType', 'leadCampaignId', 'inDispo', 'rentalAt', 'deadAt',
      'exitStrategy',
    ],
    raw: true,
  }) as any
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data = parsed.data
  const updates: Record<string, unknown> = { ...data }

  // Require an exit strategy when moving a lead to UNDER_CONTRACT. The
  // downstream exit-routing code keys off exitStrategy to transition the
  // property to IN_TM + secondary pipeline (Dispo/Inventory/Rental). Without
  // one, the lead would silently stall at UNDER_CONTRACT without routing.
  if (
    data.activeLeadStage === 'UNDER_CONTRACT' &&
    data.activeLeadStage !== existing.activeLeadStage &&
    !data.exitStrategy &&
    !existing.exitStrategy
  ) {
    return NextResponse.json(
      { error: 'An exit strategy is required when moving a lead to Under Contract.' },
      { status: 422 },
    )
  }

  // Reject contradictory state combinations. The existing DEAD lead path
  // explicitly preserves activeLeadStage for reactivation (see below), so we
  // allow that specific combo. Everything else that pairs a terminal status
  // with an active stage is flagged.
  const conflict = detectStateConflict(data, existing)
  if (conflict) {
    return NextResponse.json({ error: `State conflict: ${conflict}` }, { status: 422 })
  }

  // Validate that leadCampaignId (if being set or already present) matches
  // the effective leadType after this update
  if (data.leadCampaignId) {
    const effectiveLeadType = data.leadType ?? existing.leadType
    const lc = await LeadCampaign.findByPk(data.leadCampaignId, {
      attributes: ['type'],
      raw: true,
    }) as any
    if (!lc) {
      return NextResponse.json({ error: 'Lead campaign not found' }, { status: 422 })
    }
    const expectedType = effectiveLeadType === 'DIRECT_TO_SELLER' ? 'DTS' : 'DTA'
    if (lc.type && lc.type !== expectedType) {
      return NextResponse.json(
        { error: `Campaign type ${lc.type} does not match lead type ${effectiveLeadType}` },
        { status: 422 },
      )
    }
  }

  // Convert datetime strings to Date objects (add T12:00:00 to date-only strings to avoid timezone shift)
  function toSafeDate(v: string): Date {
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : new Date(v)
  }
  if (data.contractDate) updates.contractDate = toSafeDate(data.contractDate)
  else if (data.contractDate === null) updates.contractDate = null
  if (data.soldAt) updates.soldAt = toSafeDate(data.soldAt)
  else if (data.soldAt === null) updates.soldAt = null
  if (data.offerDate) updates.offerDate = toSafeDate(data.offerDate)
  else if (data.offerDate === null) updates.offerDate = null
  if (data.expectedProfitDate) updates.expectedProfitDate = toSafeDate(data.expectedProfitDate)
  else if (data.expectedProfitDate === null) updates.expectedProfitDate = null
  if (data.scheduledClosingDate) updates.scheduledClosingDate = toSafeDate(data.scheduledClosingDate)
  else if (data.scheduledClosingDate === null) updates.scheduledClosingDate = null

  // When moving to DEAD — keep activeLeadStage so lead can return to pipeline later
  if (data.leadStatus === 'DEAD') {
    updates.propertyStatus = 'DEAD'
    updates.deadAt = new Date()
    // Persist the captured reasons. Empty array + null `other` is fine
    // (e.g. bulk dead-mark or merge-driven dead transitions don't supply
    // them) — the dead-lead modal forces at least one selection in the UI.
    if (data.deadReasons !== undefined) {
      updates.deadReasons = data.deadReasons
    }
    if (data.deadOtherReason !== undefined) {
      updates.deadOtherReason = data.deadOtherReason
    }
    // Don't clear activeLeadStage — lead keeps its pipeline position for reactivation
  }
  // Reactivation path (DEAD → ACTIVE/anything-else): wipe the dead-reason
  // capture so a future re-deactivation starts fresh.
  if (existing.leadStatus === 'DEAD' && data.leadStatus && data.leadStatus !== 'DEAD') {
    updates.deadReasons = []
    updates.deadOtherReason = null
  }
  // When moving to WARM, set timestamp
  if (data.leadStatus === 'WARM') {
    updates.warmAt = new Date()
  }
  // When moving to REFERRED_TO_AGENT, set timestamp
  if (data.leadStatus === 'REFERRED_TO_AGENT') {
    updates.referredAt = new Date()
  }

  // Each entry's `detail` may be a plain string (legacy) OR a structured
  // object (newer richer payloads — e.g. dead-status transitions carry
  // `deadReasons` + `deadOtherReason` so the audit trail shows exactly
  // why the lead was killed without re-querying the property row).
  const activityEntries: Array<{
    action: string
    detail: string | Record<string, unknown>
  }> = []

  if (data.activeLeadStage && data.activeLeadStage !== existing.activeLeadStage) {
    activityEntries.push({ action: 'STAGE_CHANGE', detail: `Stage changed from ${existing.activeLeadStage ?? 'none'} to ${data.activeLeadStage}` })
  }
  if (data.leadStatus && data.leadStatus !== existing.leadStatus) {
    if (data.leadStatus === 'DEAD') {
      // Rich payload for the audit trail. `deadReasons` is the set of
      // checkbox codes from DeadLeadReasonModal; `deadOtherReason` is
      // the verbatim text from the "Other Reasons" textarea.
      activityEntries.push({
        action: 'STATUS_CHANGE',
        detail: {
          description: 'Lead moved to DEAD',
          fromStatus: existing.leadStatus,
          toStatus: 'DEAD',
          deadReasons: data.deadReasons ?? [],
          deadOtherReason: data.deadOtherReason ?? null,
        },
      })
    } else {
      activityEntries.push({
        action: 'STATUS_CHANGE',
        detail: `Status changed to ${data.leadStatus}`,
      })
    }
  }
  if (data.propertyStatus && data.propertyStatus !== existing.propertyStatus) {
    activityEntries.push({ action: 'PIPELINE_CHANGE', detail: `Moved to ${data.propertyStatus} pipeline` })
  }
  if (data.tmStage && data.tmStage !== existing.tmStage) {
    activityEntries.push({ action: 'STAGE_CHANGE', detail: `TM stage changed to ${data.tmStage}` })
  }
  if (data.inventoryStage && data.inventoryStage !== existing.inventoryStage) {
    activityEntries.push({ action: 'STAGE_CHANGE', detail: `Inventory stage changed to ${data.inventoryStage}` })
  }
  if (data.tags !== undefined && existing) {
    const existingTags = (existing.tags ?? []) as string[]
    const added = data.tags.filter((t: string) => !existingTags.includes(t))
    const removed = existingTags.filter((t: string) => !data.tags!.includes(t))
    if (added.length > 0) {
      activityEntries.push({ action: 'TAG_ADDED', detail: `Tags added: ${added.join(', ')}` })
    }
    if (removed.length > 0) {
      activityEntries.push({ action: 'TAG_REMOVED', detail: `Tags removed: ${removed.join(', ')}` })
    }
  }

  const stageHistoryEntries: Array<{ pipeline: string; fromStage?: string; toStage: string; changedById: string; changedByName: string }> = []

  if (data.activeLeadStage && data.activeLeadStage !== existing.activeLeadStage) {
    stageHistoryEntries.push({ pipeline: 'leads', fromStage: existing.activeLeadStage ?? undefined, toStage: data.activeLeadStage, changedById: userId, changedByName: userName })
  }
  if (data.tmStage && data.tmStage !== existing.tmStage) {
    stageHistoryEntries.push({ pipeline: 'tm', fromStage: existing.tmStage ?? undefined, toStage: data.tmStage, changedById: userId, changedByName: userName })
  }
  if (data.inventoryStage && data.inventoryStage !== existing.inventoryStage) {
    stageHistoryEntries.push({ pipeline: 'inventory', fromStage: existing.inventoryStage ?? undefined, toStage: data.inventoryStage, changedById: userId, changedByName: userName })
  }
  if (data.leadStatus === 'DEAD' && existing.leadStatus !== 'DEAD') {
    stageHistoryEntries.push({
      pipeline: 'dead',
      fromStage: existing.leadStatus,
      toStage: 'DEAD',
      changedById: userId,
      changedByName: userName,
    })
  }
  if (existing.leadStatus === 'DEAD' && data.leadStatus === 'ACTIVE') {
    stageHistoryEntries.push({
      pipeline: 'dead',
      fromStage: 'DEAD',
      toStage: 'REACTIVATED',
      changedById: userId,
      changedByName: userName,
    })
  }

  // Exit-strategy routing: compute additional mutations that MUST land in the
  // same transaction as the main update. Previously this was fire-and-forget,
  // which meant a crash between the two writes left the lead in IN_TM but
  // without its secondary-pipeline flags set.
  const exitRouting: {
    pipelineData: Record<string, unknown>
    stageHistoryEntry: {
      pipeline: string
      fromStage: string
      toStage: string
      changedById: string
      changedByName: string
      reason: string
    } | null
  } = { pipelineData: {}, stageHistoryEntry: null }

  // Fire exit routing when the lead transitions INTO UNDER_CONTRACT. Use the
  // caller's exitStrategy if provided, else the one already on the property
  // (captured from an earlier save).
  const effectiveExitStrategy = data.exitStrategy ?? existing.exitStrategy
  if (
    data.activeLeadStage === 'UNDER_CONTRACT' &&
    data.activeLeadStage !== existing.activeLeadStage &&
    effectiveExitStrategy
  ) {
    const exit = effectiveExitStrategy
    const isRouteA = ROUTE_A_EXITS.includes(exit)
    const isRouteC = ROUTE_C_EXITS.includes(exit)
    exitRouting.pipelineData.propertyStatus = 'IN_TM'
    exitRouting.pipelineData.tmStage = 'NEW_CONTRACT'
    if (isRouteA) exitRouting.pipelineData.inDispo = true
    if (!isRouteA && !isRouteC) exitRouting.pipelineData.inventoryStage = 'NEW_INVENTORY'
    if (isRouteC) exitRouting.pipelineData.rentalAt = new Date()
    const routeLabel = isRouteA ? 'TM + Dispo' : isRouteC ? 'TM + Rental' : 'TM + Inventory'
    exitRouting.stageHistoryEntry = {
      pipeline: 'tm',
      fromStage: 'UNDER_CONTRACT',
      toStage: 'IN_TM',
      changedById: userId,
      changedByName: userName,
      reason: `Auto-routed via ${exit} → ${routeLabel}`,
    }
  }

  // Detect flag flips on the EFFECTIVE new state (data + exitRouting combined)
  // so routing-induced inDispo/rentalAt transitions also land in the audit trail.
  const effectiveInDispo =
    'inDispo' in exitRouting.pipelineData
      ? Boolean(exitRouting.pipelineData.inDispo)
      : 'inDispo' in data
        ? Boolean(data.inDispo)
        : existing.inDispo
  const effectiveRentalAt =
    'rentalAt' in exitRouting.pipelineData
      ? (exitRouting.pipelineData.rentalAt as Date | null)
      : existing.rentalAt

  if (effectiveInDispo !== existing.inDispo) {
    stageHistoryEntries.push({
      pipeline: 'dispo',
      fromStage: existing.inDispo ? 'IN_DISPO' : 'NOT_IN_DISPO',
      toStage: effectiveInDispo ? 'IN_DISPO' : 'NOT_IN_DISPO',
      changedById: userId,
      changedByName: userName,
    })
  }
  if (Boolean(effectiveRentalAt) !== Boolean(existing.rentalAt)) {
    stageHistoryEntries.push({
      pipeline: 'rental',
      fromStage: existing.rentalAt ? 'RENTAL' : 'NOT_RENTAL',
      toStage: effectiveRentalAt ? 'RENTAL' : 'NOT_RENTAL',
      changedById: userId,
      changedByName: userName,
    })
  }

  const finalStageHistoryEntries = exitRouting.stageHistoryEntry
    ? [...stageHistoryEntries, exitRouting.stageHistoryEntry]
    : stageHistoryEntries

  // Port to Sequelize. The previous implementation used Prisma's nested-
  // write idiom (`activityLogs: { createMany: ... }, stageHistory: { ... }`)
  // which Sequelize doesn't have a direct equivalent for. We wrap the three
  // writes in a `sequelize.transaction` so the property update + the
  // activity-log entries + the stage-history entries either all commit or
  // all roll back — matching the original atomicity.
  //
  // For dead-lead transitions specifically, this means the new
  // `deadReasons` / `deadOtherReason` columns and the corresponding
  // ActivityLog row land in the same transaction, so a partial state
  // can't leak into the audit trail.
  const property = await sequelize.transaction(async (tx) => {
    const [count] = await Property.update(
      { ...updates, ...exitRouting.pipelineData } as any,
      { where: { id }, transaction: tx },
    )
    if (count === 0) {
      throw new Error('Property not found')
    }

    if (activityEntries.length > 0) {
      // The dead-status transition pushes a tailored entry that includes
      // the captured reasons in its `detail` payload (see "data.leadStatus
      // === 'DEAD'" branch above) so the audit trail records exactly why
      // the lead was killed.
      await ActivityLog.bulkCreate(
        activityEntries.map((e) => ({
          propertyId: id,
          userId,
          action: e.action,
          detail: typeof e.detail === 'string'
            ? { description: e.detail }
            : (e.detail as Record<string, unknown>),
        })),
        { transaction: tx },
      )
    }

    if (finalStageHistoryEntries.length > 0) {
      await StageHistory.bulkCreate(
        finalStageHistoryEntries.map((e) => ({
          propertyId: id,
          pipeline: e.pipeline,
          fromStage: e.fromStage ?? null,
          toStage: e.toStage,
          changedById: e.changedById,
          changedByName: e.changedByName,
        })),
        { transaction: tx },
      )
    }

    const fresh = await Property.findByPk(id, { transaction: tx })
    return fresh?.get({ plain: true })
  })

  // Return response immediately — fire-and-forget all non-critical work
  const response = NextResponse.json({ success: true, data: property })

  // Fire-and-forget: domain events (non-blocking)
  void emitEvent({ type: DomainEvents.LEAD_UPDATED, propertyId: id, userId, actorType: 'user', payload: { changes: Object.keys(data) } })
  if (data.leadStatus && data.leadStatus !== existing.leadStatus) {
    void emitEvent({ type: DomainEvents.LEAD_STATUS_CHANGED, propertyId: id, userId, actorType: 'user', payload: { from: existing.leadStatus, to: data.leadStatus } })
  }
  if (data.activeLeadStage === 'UNDER_CONTRACT' && data.activeLeadStage !== existing.activeLeadStage) {
    void emitEvent({ type: DomainEvents.LEAD_UNDER_CONTRACT, propertyId: id, userId, actorType: 'user', payload: { exitStrategy: data.exitStrategy } })
  }
  if (data.tags !== undefined) {
    const addedTags = data.tags.filter((t: string) => !((existing.tags ?? []) as string[]).includes(t))
    if (addedTags.length > 0) {
      void emitEvent({ type: DomainEvents.TAG_ADDED, propertyId: id, userId, actorType: 'user', payload: { tags: addedTags } })
    }
  }

  // Fire-and-forget: when leadCampaignId changes, re-evaluate PropertyTeamAssignment
  // (drops rows that are no longer valid on the new campaign, auto-fills vacancies)
  if (data.leadCampaignId !== undefined && data.leadCampaignId !== existing.leadCampaignId) {
    void reEvaluateTeam(id, existing.leadCampaignId, data.leadCampaignId, userId)
  }

  // Fire-and-forget: automation triggers on stage changes
  // Covers STAGE_CHANGE, OFFER_MADE, UNDER_CONTRACT (in addition to LEAD_CREATED which fires on POST)
  if (data.activeLeadStage && data.activeLeadStage !== existing.activeLeadStage) {
    void enqueueAutomation({ trigger: 'STAGE_CHANGE', propertyId: id, meta: { from: existing.activeLeadStage, to: data.activeLeadStage } })
    void runStatusAutomations(id, 'leads', data.activeLeadStage, userId)

    if (data.activeLeadStage === 'OFFER_MADE') {
      void enqueueAutomation({ trigger: 'OFFER_MADE', propertyId: id })
    }
    if (data.activeLeadStage === 'UNDER_CONTRACT') {
      void enqueueAutomation({ trigger: 'UNDER_CONTRACT', propertyId: id })
    }
  }
  if (data.tmStage && data.tmStage !== existing.tmStage) {
    void enqueueAutomation({ trigger: 'STAGE_CHANGE', propertyId: id, meta: { pipeline: 'tm', from: existing.tmStage, to: data.tmStage } })
    void runStatusAutomations(id, 'tm', data.tmStage, userId)
  }
  if (data.inventoryStage && data.inventoryStage !== existing.inventoryStage) {
    void enqueueAutomation({ trigger: 'STAGE_CHANGE', propertyId: id, meta: { pipeline: 'inventory', from: existing.inventoryStage, to: data.inventoryStage } })
    void runStatusAutomations(id, 'inventory', data.inventoryStage, userId)
  }
  // Tag-added trigger (already has domain event above — add automation enqueue)
  if (data.tags !== undefined) {
    const addedTags = data.tags.filter((t: string) => !((existing.tags ?? []) as string[]).includes(t))
    if (addedTags.length > 0) {
      void enqueueAutomation({ trigger: 'TAG_ADDED', propertyId: id, meta: { tags: addedTags } })
    }
  }

  return response
}

/**
 * Reject contradictory state combinations in a single PATCH. Returns a human
 * message if the payload would leave the lead in an invalid state, otherwise
 * null. The DEAD-with-preserved-stage case is allowed by design (reactivation).
 */
function detectStateConflict(
  data: Record<string, unknown>,
  existing: { leadStatus: string; propertyStatus: string; activeLeadStage: string | null; tmStage: string | null; inventoryStage: string | null },
): string | null {
  const nextLeadStatus = (data.leadStatus as string | undefined) ?? existing.leadStatus
  const nextPropertyStatus = (data.propertyStatus as string | undefined) ?? existing.propertyStatus

  // Only treat a field as "being set" if its value actually CHANGES. Re-sending
  // the same value (e.g. an edit PATCH that includes the current stage for
  // context) shouldn't trip the validator.
  const settingActiveLeadStage =
    'activeLeadStage' in data &&
    data.activeLeadStage != null &&
    data.activeLeadStage !== existing.activeLeadStage
  const settingTmStage =
    'tmStage' in data &&
    data.tmStage != null &&
    data.tmStage !== existing.tmStage
  const settingInventoryStage =
    'inventoryStage' in data &&
    data.inventoryStage != null &&
    data.inventoryStage !== existing.inventoryStage

  // Setting an active lead stage while the lead is being moved to DEAD/WARM/REFERRED
  // (without an explicit reactivation via leadStatus=ACTIVE) is contradictory.
  if (
    settingActiveLeadStage &&
    nextLeadStatus !== 'ACTIVE' &&
    data.leadStatus !== 'ACTIVE'
  ) {
    return `Cannot set activeLeadStage while leadStatus is ${nextLeadStatus}`
  }

  // Setting tmStage when the property isn't (or isn't becoming) IN_TM
  if (settingTmStage && nextPropertyStatus !== 'IN_TM') {
    return `Cannot set tmStage while propertyStatus is ${nextPropertyStatus}`
  }

  // Setting inventoryStage when the property isn't (or isn't becoming) IN_INVENTORY.
  // The earlier version of this check also ignored carry-over inventoryStage
  // values (e.g. dual-pipeline IN_TM with inventoryStage='NEW_INVENTORY'),
  // but since settingInventoryStage now requires a real change, that case
  // naturally passes.
  if (settingInventoryStage && nextPropertyStatus !== 'IN_INVENTORY') {
    return `Cannot set inventoryStage while propertyStatus is ${nextPropertyStatus}`
  }

  // Cannot move to SOLD/RENTAL while simultaneously setting an active lead stage
  if (
    (nextPropertyStatus === 'SOLD' || nextPropertyStatus === 'RENTAL') &&
    settingActiveLeadStage
  ) {
    return `Cannot set activeLeadStage on a ${nextPropertyStatus} property`
  }

  return null
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const limited = rateLimitMutation(req, { bucket: 'leads.delete', limit: 20 })
  if (limited) return limited
  const session = await auth()
  const deny = requirePermission(session, 'leads.delete')
  if (deny) return deny

  const { id } = await params

  await sequelize.transaction(async (tx) => {
    // Snapshot the contacts attached to this lead BEFORE we drop the
    // join rows — we'll cascade-delete any contact that has no other
    // property attached. Without this, the contact (e.g., the "Unknown
    // Caller +14697997747" auto-created from an inbound call) sticks
    // around and the next inbound call still matches it.
    const linkedContacts = await PropertyContact.findAll({
      where: { propertyId: id },
      attributes: ['contactId'],
      raw: true,
      transaction: tx,
    }) as any[]
    const contactIds = Array.from(new Set(linkedContacts.map((r) => r.contactId).filter(Boolean)))

    await ActivityLog.destroy({ where: { propertyId: id }, transaction: tx })
    await StageHistory.destroy({ where: { propertyId: id }, transaction: tx })
    await Note.destroy({ where: { propertyId: id }, transaction: tx })
    await Task.destroy({ where: { propertyId: id }, transaction: tx })
    await Message.destroy({ where: { propertyId: id }, transaction: tx })
    await PropertyContact.destroy({ where: { propertyId: id }, transaction: tx })
    await PropertyFile.destroy({ where: { propertyId: id }, transaction: tx })
    await BuyerMatch.destroy({ where: { propertyId: id }, transaction: tx })
    await BuyerOffer.destroy({ where: { propertyId: id }, transaction: tx })
    await CampaignEnrollment.destroy({ where: { propertyId: id }, transaction: tx })
    await Conversation.destroy({ where: { propertyId: id }, transaction: tx })
    await EsignDocument.destroy({ where: { propertyId: id }, transaction: tx })
    await Property.destroy({ where: { id }, transaction: tx })

    // Cascade-delete now-orphaned contacts. A contact is orphaned if
    // it has zero remaining PropertyContact rows after the join above
    // was dropped. Multi-property contacts (a buyer attached to many
    // listings) survive untouched.
    for (const contactId of contactIds) {
      const remaining = await PropertyContact.count({
        where: { contactId },
        transaction: tx,
      })
      if (remaining === 0) {
        await Contact.destroy({ where: { id: contactId }, transaction: tx })
      }
    }
  })

  return NextResponse.json({ success: true })
}
