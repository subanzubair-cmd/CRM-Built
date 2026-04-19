'use client'

import { useState, useCallback } from 'react'
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

interface TmKanbanRow {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  tmStage: string | null
  exitStrategy: string | null
  leadType: string | null
  contractDate: Date | string | null
  contractPrice: number | null
  scheduledClosingDate: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string
  contacts: Array<{
    contact: { firstName: string; lastName?: string | null; phone?: string | null }
  }>
  assignedTo?: { id: string; name: string } | null
  _count: { tasks: number }
}

interface TmKanbanBoardProps {
  rows: TmKanbanRow[]
  commStats: Record<string, CommStats>
}

/* ------------------------------------------------------------------ */
/*  Stage definitions                                                  */
/* ------------------------------------------------------------------ */

const TM_STAGES: { key: string; label: string; color: string }[] = [
  { key: 'NEW_CONTRACT', label: 'New Contract', color: 'bg-blue-200' },
  { key: 'MARKETING_TO_BUYERS', label: 'Marketing to Buyers', color: 'bg-purple-200' },
  { key: 'SHOWING_TO_BUYERS', label: 'Showing to Buyers', color: 'bg-yellow-200' },
  { key: 'EVALUATING_OFFERS', label: 'Evaluating Offers', color: 'bg-orange-200' },
  { key: 'ACCEPTED_OFFER', label: 'Accepted Offer', color: 'bg-emerald-200' },
  { key: 'CLEAR_TO_CLOSE', label: 'Clear to Close', color: 'bg-green-200' },
]

/* ------------------------------------------------------------------ */
/*  Exit strategy label map                                            */
/* ------------------------------------------------------------------ */

const EXIT_LABELS: Record<string, string> = {
  WHOLESALE_ASSIGNMENT: 'Wholesale Assignment',
  WHOLESALE_DOUBLE_CLOSE: 'Wholesale Double Close',
  INSTALLMENT: 'Installment',
  SELLER_FINANCE: 'Seller Finance',
  FIX_AND_FLIP: 'Fix & Flip',
  JOINT_VENTURE: 'Joint Venture',
  NEW_CONSTRUCTION: 'New Construction',
  NOVATION: 'Novation',
  PARTNERSHIP: 'Partnership',
  PROJECT_MANAGEMENT: 'Project Mgmt',
}

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

function daysSince(d: Date | string | null): number {
  if (!d) return 0
  const dt = typeof d === 'string' ? new Date(d) : d
  return Math.floor((Date.now() - dt.getTime()) / 86_400_000)
}

function truncateAddress(parts: (string | null | undefined)[]): string {
  const full = parts.filter(Boolean).join(', ')
  return full.length > 40 ? full.slice(0, 37) + '\u2026' : full
}

function fmtShortDate(d: Date | string | null): string {
  if (!d) return 'N/A'
  const dt = typeof d === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00') : new Date(d)) : d
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
}

/* ------------------------------------------------------------------ */
/*  TmKanbanCard                                                       */
/* ------------------------------------------------------------------ */

function TmKanbanCard({
  row,
  commStats,
  isDragging,
}: {
  row: TmKanbanRow
  commStats: Record<string, CommStats>
  isDragging?: boolean
}) {
  const contact = row.contacts[0]?.contact
  const stats = commStats[row.id]
  const address = truncateAddress([row.streetAddress, row.city, row.state, row.zip])
  const pipelineLabel = row.leadType === 'DIRECT_TO_AGENT' ? 'DTA' : 'DTS'

  return (
    <div
      onClick={() => window.open(`/tm/${row.id}`, '_blank')}
      className={`
        bg-white border border-gray-200 rounded-[14px] p-3
        shadow-[0_2px_8px_rgba(0,0,0,0.06)]
        hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer
        ${isDragging ? 'opacity-50' : ''}
      `}
    >
      {/* Row 1: address + pipeline badge + call button */}
      <div className="flex items-start justify-between gap-1.5 mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${pipelineLabel === 'DTA' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{pipelineLabel}</span>
            <p className="text-[12px] font-semibold text-gray-900 leading-snug truncate">
              {address || 'Unknown address'}
            </p>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); if (contact?.phone) window.open(`/tm/${row.id}?action=call`, '_blank') }}
          disabled={!contact?.phone}
          className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${contact?.phone ? 'border-blue-400 bg-blue-50 hover:bg-blue-100' : 'border-gray-200 bg-gray-50 opacity-40'}`}
        >
          <Phone className={`w-3 h-3 ${contact?.phone ? 'text-blue-600' : 'text-gray-400'}`} />
        </button>
      </div>

      {/* Row 2: contact + phone */}
      <p className="text-[11px] text-gray-600">
        {contact ? `${contact.firstName} ${contact.lastName ?? ''}`.trim() : 'No contact'}
      </p>
      <p className="text-[11px] text-gray-400">{contact?.phone || 'No phone'}</p>

      {/* Row 3: Updated timestamp */}
      <p className="text-[10px] text-blue-600 mt-1">
        <span className="font-semibold">Updated:</span> {fmtTime(row.updatedAt)}
      </p>

      {/* Divider + Scheduled Closing + UC Price */}
      <div className="border-t border-gray-100 my-2" />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <p className="text-[9px] text-gray-400 font-semibold uppercase">Schd. Closing</p>
          <p className="text-[11px] text-gray-700">{fmtShortDate(row.scheduledClosingDate)}</p>
        </div>
        <div>
          <p className="text-[9px] text-gray-400 font-semibold uppercase">U.C Price</p>
          <p className="text-[11px] text-gray-700 font-medium">{row.contractPrice ? `$${row.contractPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'N/A'}</p>
        </div>
      </div>

      {/* Divider + Call/SMS counts + Last Call + Tasks */}
      <div className="border-t border-gray-100 my-2" />
      <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-1.5">
        <span className="flex items-center gap-0.5">
          <Phone className="w-3 h-3" /> x{stats?.callCount ?? 0}
        </span>
        <span className="flex items-center gap-0.5">
          <MessageSquare className="w-3 h-3" /> x{stats?.smsCount ?? 0}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>
          Last <Phone className="w-3 h-3 inline" /> {stats?.lastCallAt ? fmtShortDate(stats.lastCallAt) : 'N/A'}
        </span>
        <span className="flex items-center gap-0.5">
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
  commStats,
}: {
  row: TmKanbanRow
  commStats: Record<string, CommStats>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} suppressHydrationWarning>
      <TmKanbanCard
        row={row}
        commStats={commStats}
        isDragging={isDragging}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  TmKanbanColumn with useDroppable                                   */
/* ------------------------------------------------------------------ */

function TmKanbanColumn({
  stage,
  cards,
  commStats,
}: {
  stage: (typeof TM_STAGES)[number]
  cards: TmKanbanRow[]
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
              commStats={commStats}
            />
          ))}
          {cards.length === 0 && (
            <div className="flex items-center justify-center h-16 text-[11px] text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
              No properties
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  TmKanbanBoard (exported)                                           */
/* ------------------------------------------------------------------ */

export function TmKanbanBoard({ rows, commStats }: TmKanbanBoardProps) {
  const [localRows, setLocalRows] = useState(rows)
  const [activeRow, setActiveRow] = useState<TmKanbanRow | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const getRowsForStage = useCallback(
    (stage: string) => localRows.filter((r) => (r.tmStage ?? 'NEW_CONTRACT') === stage),
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
      TM_STAGES.find((s) => s.key === over.id)?.key ??
      localRows.find((r) => r.id === over.id)?.tmStage ??
      null
    if (!targetStage) return

    const row = localRows.find((r) => r.id === active.id)
    if (!row || row.tmStage === targetStage) return

    // Optimistic update
    setLocalRows((prev) =>
      prev.map((r) => (r.id === active.id ? { ...r, tmStage: targetStage } : r))
    )

    try {
      const res = await fetch(`/api/leads/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmStage: targetStage }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = typeof body?.error === 'string' ? body.error : `Move failed (${res.status})`
        throw new Error(msg)
      }
      toast.success(`Moved to ${TM_STAGES.find(s => s.key === targetStage)?.label}`)
    } catch (err) {
      setLocalRows(rows)
      toast.error(err instanceof Error ? err.message : 'Failed to move. Reverted.')
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[60vh]">
        {TM_STAGES.map((stage) => {
          const stageRows = getRowsForStage(stage.key)
          return (
            <TmKanbanColumn
              key={stage.key}
              stage={stage}
              cards={stageRows}
              commStats={commStats}
            />
          )
        })}
      </div>

      <DragOverlay>
        {activeRow && (
          <TmKanbanCard row={activeRow} commStats={commStats} />
        )}
      </DragOverlay>
    </DndContext>
  )
}
