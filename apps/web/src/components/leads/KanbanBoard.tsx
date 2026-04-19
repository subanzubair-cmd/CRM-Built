'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Phone, MessageSquare, CheckSquare } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { OfferMadeModal } from './OfferMadeModal'
import { UnderContractModal, type UnderContractData } from './UnderContractModal'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CommStats {
  callCount: number
  smsCount: number
  lastCallAt: Date | null
  totalTasks: number
  completedTasks: number
}

interface KanbanRow {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  activeLeadStage: string | null
  isHot: boolean
  leadType: string
  updatedAt: Date | string
  createdAt: Date | string
  lastActivityAt?: Date | string | null
  contacts: Array<{
    contact: { firstName: string; lastName?: string | null; phone?: string | null }
  }>
  assignedTo?: { id: string; name: string } | null
  _count: { tasks: number }
}

interface KanbanBoardProps {
  rows: KanbanRow[]
  pipeline: string
  commStats: Record<string, CommStats>
}

/* ------------------------------------------------------------------ */
/*  Stage definitions                                                  */
/* ------------------------------------------------------------------ */

type StageItem = { key: string; label: string; color: string }

const DTS_STAGES: StageItem[] = [
  { key: 'NEW_LEAD', label: 'New Lead', color: 'bg-gray-200' },
  { key: 'DISCOVERY', label: 'Discovery', color: 'bg-blue-200' },
  { key: 'INTERESTED_ADD_TO_FOLLOW_UP', label: 'Interested / Follow Up', color: 'bg-yellow-200' },
  { key: 'APPOINTMENT_MADE', label: 'Appt Made', color: 'bg-purple-200' },
  { key: 'DUE_DILIGENCE', label: 'Due Diligence', color: 'bg-orange-200' },
  { key: 'OFFER_MADE', label: 'Offer Made', color: 'bg-emerald-200' },
  { key: 'OFFER_FOLLOW_UP', label: 'Offer Follow-Up', color: 'bg-blue-200' },
  { key: 'UNDER_CONTRACT', label: 'Under Contract', color: 'bg-green-200' },
]

const DTA_STAGES: StageItem[] = [
  { key: 'NEW_LEAD', label: 'New Lead', color: 'bg-gray-200' },
  { key: 'DISCOVERY', label: 'Discovery', color: 'bg-blue-200' },
  { key: 'INTERESTED_ADD_TO_FOLLOW_UP', label: 'Interested / Follow Up', color: 'bg-yellow-200' },
  { key: 'DUE_DILIGENCE', label: 'Due Diligence', color: 'bg-orange-200' },
  { key: 'OFFER_MADE', label: 'Offer Made', color: 'bg-emerald-200' },
  { key: 'OFFER_FOLLOW_UP', label: 'Offer Follow-Up', color: 'bg-blue-200' },
  { key: 'UNDER_CONTRACT', label: 'Under Contract', color: 'bg-green-200' },
]

function getStagesForPipeline(pipeline: string): StageItem[] {
  return pipeline === 'dta' ? DTA_STAGES : DTS_STAGES
}

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

function fmtUpdated(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' +
    dt
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      .toLowerCase()
}

function fmtCreated(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysSince(d: Date | string): number {
  const dt = typeof d === 'string' ? new Date(d) : d
  return Math.floor((Date.now() - dt.getTime()) / 86_400_000)
}

function fmtLastCall(d: Date | null): string {
  if (!d) return '--'
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function truncateAddress(parts: (string | null | undefined)[]): string {
  const full = parts.filter(Boolean).join(', ')
  return full.length > 40 ? full.slice(0, 37) + '\u2026' : full
}

/* ------------------------------------------------------------------ */
/*  KanbanCard                                                         */
/* ------------------------------------------------------------------ */

function KanbanCard({
  row,
  pipeline,
  commStats,
  isDragging,
}: {
  row: KanbanRow
  pipeline: string
  commStats: Record<string, CommStats>
  isDragging?: boolean
}) {
  const router = useRouter()
  const contact = row.contacts[0]?.contact
  const stats = commStats[row.id]
  const address = truncateAddress([row.streetAddress, row.city, row.state, row.zip])

  return (
    <div
      onClick={() => window.open(`/leads/${pipeline}/${row.id}`, '_blank')}
      className={`
        ${pipeline === 'dta' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'} border rounded-[14px] p-4
        shadow-[0_2px_8px_rgba(0,0,0,0.06)]
        hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer
        ${isDragging ? 'opacity-50' : ''}
      `}
    >
      {/* Row 1: address + call button */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-[12px] font-semibold text-gray-900 leading-snug min-w-0 truncate">
          {address || 'Unknown address'}
        </p>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (contact?.phone) {
              window.open(`/leads/${pipeline}/${row.id}?action=call`, '_blank')
            }
          }}
          disabled={!contact?.phone}
          className={`w-[30px] h-[30px] rounded-[9px] border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors ${
            contact?.phone
              ? 'border-sky-500 bg-sky-50 hover:bg-sky-100 cursor-pointer'
              : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
          }`}
          title={contact?.phone ? `Call ${contact.phone}` : 'No phone number'}
        >
          <Phone className={`w-[13px] h-[13px] ${contact?.phone ? 'text-sky-500' : 'text-gray-400'}`} />
        </button>
      </div>

      {/* Row 2: contact name + hot indicator */}
      <p className="text-[11px] text-gray-600 mb-0.5">
        {contact ? `${contact.firstName} ${contact.lastName || ''}`.trim() : 'No contact'}
        {row.isHot && ' \uD83D\uDD25'}
      </p>

      {/* Row 3: phone */}
      <p className="text-[11px] text-gray-400 mb-1">{contact?.phone || 'No phone'}</p>

      {/* Row 4: Updated timestamp + elapsed since last activity */}
      <p className="text-[10px] mb-1">
        <span className="text-amber-600 font-semibold">Updated:</span>{' '}
        <span className="text-gray-500">{fmtUpdated(row.updatedAt)}</span>
      </p>
      <p className="text-[10px] mb-2">
        <span className="text-blue-600 font-semibold">Last activity:</span>{' '}
        <span className="text-gray-500">
          {row.lastActivityAt
            ? formatDistanceToNow(new Date(row.lastActivityAt), { addSuffix: true })
            : '—'}
        </span>
      </p>

      {/* Divider */}
      <div className="border-t border-gray-100 my-2" />

      {/* Created + In pipeline */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <p className="text-[9.5px] uppercase tracking-wide text-gray-400 font-medium mb-0.5">
            Created
          </p>
          <p className="text-[11px] text-gray-700">{fmtCreated(row.createdAt)}</p>
        </div>
        <div>
          <p className="text-[9.5px] uppercase tracking-wide text-gray-400 font-medium mb-0.5">
            In pipeline
          </p>
          <p className="text-[11px] text-gray-700">{daysSince(row.createdAt)} days</p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 my-2" />

      {/* Activity counts */}
      <div className="flex items-center gap-3 mb-1">
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <Phone className="w-3 h-3 text-gray-400" />
          x{stats?.callCount ?? 0}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <MessageSquare className="w-3 h-3 text-gray-400" />
          x{stats?.smsCount ?? 0}
        </span>
      </div>

      {/* Last call + Tasks */}
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          Last <Phone className="w-3 h-3 text-gray-400" />{' '}
          {stats?.lastCallAt ? fmtLastCall(stats.lastCallAt) : '--'}
        </span>
        <span className="flex items-center gap-1">
          <CheckSquare className="w-3 h-3 text-gray-400" />
          {stats ? `${stats.completedTasks}/${stats.totalTasks}` : '0/0'} Tasks
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  SortableCard wrapper                                               */
/* ------------------------------------------------------------------ */

function SortableCard({
  row,
  pipeline,
  commStats,
}: {
  row: KanbanRow
  pipeline: string
  commStats: Record<string, CommStats>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} suppressHydrationWarning>
      <KanbanCard
        row={row}
        pipeline={pipeline}
        commStats={commStats}
        isDragging={isDragging}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  KanbanColumn with useDroppable                                     */
/* ------------------------------------------------------------------ */

function KanbanColumn({
  stage,
  cards,
  pipeline,
  commStats,
}: {
  stage: StageItem
  cards: KanbanRow[]
  pipeline: string
  commStats: Record<string, CommStats>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key })

  return (
    <div
      className={`w-[260px] flex-shrink-0 flex flex-col rounded-xl transition-all ${isOver ? 'ring-2 ring-blue-400' : ''}`}
    >
      {/* Column header */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl ${stage.color}`}>
        <span className="text-[12px] font-semibold text-gray-800">{stage.label}</span>
        <span className="ml-auto text-[11px] font-medium bg-white/60 text-gray-700 rounded-full px-1.5 py-0.5">
          {cards.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className="bg-slate-100 rounded-b-xl p-2 flex flex-col gap-2 min-h-[200px] flex-1"
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((row) => (
            <SortableCard
              key={row.id}
              row={row}
              pipeline={pipeline}
              commStats={commStats}
            />
          ))}
          {cards.length === 0 && (
            <div className="flex items-center justify-center h-16 text-[11px] text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
              No leads
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  KanbanBoard (exported)                                             */
/* ------------------------------------------------------------------ */

export function KanbanBoard({ rows, pipeline, commStats }: KanbanBoardProps) {
  const router = useRouter()
  const [localRows, setLocalRows] = useState(rows)
  const [activeRow, setActiveRow] = useState<KanbanRow | null>(null)
  const stages = getStagesForPipeline(pipeline)
  const [showOfferModal, setShowOfferModal] = useState<string | null>(null) // propertyId
  const [showUCModal, setShowUCModal] = useState<{ propertyId: string; initialData: UnderContractData } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const getRowsForStage = useCallback(
    (stage: string) => localRows.filter((r) => (r.activeLeadStage ?? 'NEW_LEAD') === stage),
    [localRows]
  )

  function handleDragStart(event: DragStartEvent) {
    const row = localRows.find((r) => r.id === event.active.id)
    setActiveRow(row ?? null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveRow(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const targetStage =
      stages.find((s) => s.key === over.id)?.key ??
      localRows.find((r) => r.id === over.id)?.activeLeadStage ??
      null
    if (!targetStage) return

    const row = localRows.find((r) => r.id === active.id)
    if (!row || row.activeLeadStage === targetStage) return

    // Intercept OFFER_MADE — show offer details modal first
    if (targetStage === 'OFFER_MADE') {
      setShowOfferModal(row.id)
      return
    }

    // Intercept UNDER_CONTRACT — fetch existing lead details so the modal
    // can pre-fill any already-saved fields (user shouldn't re-type them).
    if (targetStage === 'UNDER_CONTRACT') {
      try {
        const res = await fetch(`/api/leads/${row.id}`)
        const json = await res.json().catch(() => ({}))
        const d = (json.data ?? {}) as Partial<UnderContractData>
        setShowUCModal({
          propertyId: row.id,
          initialData: {
            offerPrice: d.offerPrice ?? null,
            offerType: (d.offerType as UnderContractData['offerType']) ?? null,
            offerDate: d.offerDate ?? null,
            expectedProfit: d.expectedProfit ?? null,
            expectedProfitDate: d.expectedProfitDate ?? null,
            contractDate: d.contractDate ?? null,
            contractPrice: d.contractPrice ?? null,
            scheduledClosingDate: d.scheduledClosingDate ?? null,
            exitStrategy: d.exitStrategy ?? null,
            contingencies: d.contingencies ?? null,
          },
        })
      } catch {
        setShowUCModal({
          propertyId: row.id,
          initialData: {
            offerPrice: null, offerType: null, offerDate: null,
            expectedProfit: null, expectedProfitDate: null,
            contractDate: null, contractPrice: null,
            scheduledClosingDate: null, exitStrategy: null, contingencies: null,
          },
        })
      }
      return
    }

    // Optimistic update for all other stages
    setLocalRows((prev) =>
      prev.map((r) => (r.id === active.id ? { ...r, activeLeadStage: targetStage } : r))
    )

    try {
      const res = await fetch(`/api/leads/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeLeadStage: targetStage }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = typeof body?.error === 'string' ? body.error : `Move failed (${res.status})`
        throw new Error(msg)
      }
      const stageLabel = stages.find((s) => s.key === targetStage)?.label ?? targetStage
      toast.success(`Moved to ${stageLabel}`)
    } catch (err) {
      setLocalRows(rows)
      toast.error(err instanceof Error ? err.message : 'Failed to move lead')
    }
  }

  return (
    <>
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[60vh]">
        {stages.map((stage) => {
          const stageRows = getRowsForStage(stage.key)
          return (
            <KanbanColumn
              key={stage.key}
              stage={stage}
              cards={stageRows}
              pipeline={pipeline}
              commStats={commStats}
            />
          )
        })}
      </div>

      <DragOverlay>
        {activeRow && (
          <KanbanCard row={activeRow} pipeline={pipeline} commStats={commStats} />
        )}
      </DragOverlay>
    </DndContext>

      {/* Offer Made modal — triggered by dragging to OFFER_MADE */}
      {showOfferModal && (
        <OfferMadeModal
          propertyId={showOfferModal}
          onClose={() => setShowOfferModal(null)}
          onSaved={() => {
            setShowOfferModal(null)
            // Update local state to reflect stage change
            setLocalRows((prev) =>
              prev.map((r) => r.id === showOfferModal ? { ...r, activeLeadStage: 'OFFER_MADE' } : r)
            )
            toast.success('Moved to Offer Made')
          }}
        />
      )}

      {/* Under Contract modal — triggered by dragging to UNDER_CONTRACT */}
      {showUCModal && (
        <UnderContractModal
          propertyId={showUCModal.propertyId}
          initialData={showUCModal.initialData}
          onSave={() => {
            const pid = showUCModal.propertyId
            setShowUCModal(null)
            setLocalRows((prev) =>
              prev.map((r) => r.id === pid ? { ...r, activeLeadStage: 'UNDER_CONTRACT' } : r)
            )
            toast.success('Moved to Under Contract')
          }}
          onCancel={() => setShowUCModal(null)}
        />
      )}
    </>
  )
}
