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
import { Phone, CheckSquare } from 'lucide-react'
import { toast } from 'sonner'
import { formatPhone } from '@/lib/phone'
import { DripContinuationModal } from '@/components/leads/DripContinuationModal'

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

interface InventoryRow {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  inventoryStage: string | null
  exitStrategy: string | null
  createdAt: Date | string
  updatedAt: Date | string
  contacts: Array<{
    contact: { firstName: string; lastName?: string | null; phone?: string | null }
  }>
  assignedTo?: { id: string; name: string } | null
  _count: { tasks: number }
}

interface StageConfig {
  stageCode: string
  label: string
  color: string | null
  sortOrder: number
  isActive: boolean
}

interface InventoryKanbanBoardProps {
  rows: InventoryRow[]
  commStats: Record<string, CommStats>
  stages: StageConfig[]
}

/* ------------------------------------------------------------------ */
/*  Stage definitions                                                  */
/* ------------------------------------------------------------------ */

const COLOR_PALETTE = [
  'bg-gray-200', 'bg-blue-200', 'bg-orange-200', 'bg-purple-200',
  'bg-green-200', 'bg-emerald-200', 'bg-yellow-200', 'bg-sky-200',
  'bg-pink-200', 'bg-indigo-200', 'bg-teal-200', 'bg-lime-200',
]

type StageItem = { key: string; label: string; color: string }

function buildStageItems(stages: StageConfig[]): StageItem[] {
  return stages
    .filter((s) => s.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, idx) => ({
      key: s.stageCode,
      label: s.label,
      color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
    }))
}

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

function daysSince(d: Date | string): number {
  const dt = typeof d === 'string' ? new Date(d) : d
  return Math.floor((Date.now() - dt.getTime()) / 86_400_000)
}

function truncateAddress(parts: (string | null | undefined)[]): string {
  const full = parts.filter(Boolean).join(', ')
  return full.length > 28 ? full.slice(0, 25) + '\u2026' : full
}

function fmtExitStrategy(es: string | null): string {
  if (!es) return 'None'
  return es
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/* ------------------------------------------------------------------ */
/*  InventoryCard                                                      */
/* ------------------------------------------------------------------ */

function InventoryCard({
  row,
  commStats,
  isDragging,
}: {
  row: InventoryRow
  commStats: Record<string, CommStats>
  isDragging?: boolean
}) {
  const contact = row.contacts[0]?.contact
  const stats = commStats[row.id]
  const address = truncateAddress([row.streetAddress, row.city, row.state, row.zip])

  return (
    <div
      onClick={() => window.open(`/inventory/${row.id}`, '_blank')}
      className={`
        bg-white border border-gray-200 rounded-[14px] p-4
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
              window.open(`/inventory/${row.id}?action=call`, '_blank')
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

      {/* Row 2: contact name */}
      {contact && (
        <p className="text-[11px] text-gray-600 mb-0.5">
          {contact.firstName} {contact.lastName || ''}
        </p>
      )}

      {/* Row 3: phone */}
      {contact?.phone && (
        <p className="text-[11px] text-gray-400 mb-1">{formatPhone(contact.phone)}</p>
      )}

      {/* Row 4: exit strategy badge */}
      <div className="mb-2">
        <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
          Exit: {fmtExitStrategy(row.exitStrategy)}
        </span>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 my-2" />

      {/* In Inventory + Tasks */}
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>
          <span className="text-amber-600 font-semibold">In Inventory:</span>{' '}
          {daysSince(row.createdAt)} days
        </span>
        <span className="flex items-center gap-1">
          <CheckSquare className="w-3 h-3 text-gray-400" />
          {stats ? `${stats.completedTasks}/${stats.totalTasks}` : '0/0'}
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
  row: InventoryRow
  commStats: Record<string, CommStats>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} suppressHydrationWarning>
      <InventoryCard row={row} commStats={commStats} isDragging={isDragging} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  KanbanColumn with useDroppable                                     */
/* ------------------------------------------------------------------ */

function InventoryColumn({
  stage,
  cards,
  commStats,
}: {
  stage: StageItem
  cards: InventoryRow[]
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
        className="bg-slate-100 rounded-b-xl p-2 flex flex-col gap-2 min-h-[80px]"
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((row) => (
            <SortableCard key={row.id} row={row} commStats={commStats} />
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
/*  InventoryKanbanBoard (exported)                                    */
/* ------------------------------------------------------------------ */

export function InventoryKanbanBoard({ rows, commStats, stages: stageConfigs }: InventoryKanbanBoardProps) {
  const [localRows, setLocalRows] = useState(rows)
  const [activeRow, setActiveRow] = useState<InventoryRow | null>(null)
  const stages = buildStageItems(stageConfigs)
  const defaultStage = stages[0]?.key ?? 'NEW_INVENTORY'
  const [dripModal, setDripModal] = useState<{
    enrollments: any[]
    proceed: () => Promise<void>
  } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const getRowsForStage = useCallback(
    (stage: string) => localRows.filter((r) => (r.inventoryStage ?? defaultStage) === stage),
    [localRows, defaultStage]
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
      localRows.find((r) => r.id === over.id)?.inventoryStage ??
      null
    if (!targetStage) return

    const row = localRows.find((r) => r.id === active.id)
    if (!row || row.inventoryStage === targetStage) return

    const doMove = async () => {
      // Optimistic update
      setLocalRows((prev) =>
        prev.map((r) => (r.id === active.id ? { ...r, inventoryStage: targetStage } : r))
      )
      try {
        const res = await fetch(`/api/leads/${active.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventoryStage: targetStage }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          const msg = typeof body?.error === 'string' ? body.error : `Move failed (${res.status})`
          throw new Error(msg)
        }
      } catch (err) {
        setLocalRows(rows)
        toast.error(err instanceof Error ? err.message : 'Failed to move. Reverted.')
      }
    }

    // Check for active drip enrollments before committing the move
    try {
      const dripRes = await fetch(`/api/properties/${active.id}/drip-status`)
      const dripData = await dripRes.json()
      const activeEnrollments = (dripData.data ?? []).filter((e: any) => e.isActive)
      if (activeEnrollments.length > 0) {
        setDripModal({ enrollments: activeEnrollments, proceed: doMove })
        return
      }
    } catch {
      // If drip check fails, silently proceed
    }

    await doMove()
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 items-start overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageRows = getRowsForStage(stage.key)
            return (
              <InventoryColumn
                key={stage.key}
                stage={stage}
                cards={stageRows}
                commStats={commStats}
              />
            )
          })}
        </div>

        <DragOverlay>
          {activeRow && <InventoryCard row={activeRow} commStats={commStats} />}
        </DragOverlay>
      </DndContext>

      {dripModal && (
        <DripContinuationModal
          campaignName={dripModal.enrollments[0].campaign.name}
          enrollmentId={dripModal.enrollments[0].id}
          onKeepRunning={async () => {
            await dripModal.proceed()
            setDripModal(null)
          }}
          onStopDrip={async () => {
            for (const e of dripModal.enrollments) {
              await fetch(`/api/campaign-enrollments/${e.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cancel' }),
              })
            }
            await dripModal.proceed()
            setDripModal(null)
          }}
        />
      )}
    </>
  )
}
