'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
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
import { useRouter } from 'next/navigation'
import { GripVertical, Plus, Phone, MessageSquare, X, StickyNote, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { InitiateCallModal } from '@/components/leads/InitiateCallModal'
import { SendSmsModal } from '@/components/leads/SendSmsModal'
import { AddBuyerToDispoModal } from './AddBuyerToDispoModal'

export type DispoStageValue =
  | 'POTENTIAL_BUYER'
  | 'COLD_BUYER'
  | 'WARM_BUYER'
  | 'HOT_BUYER'
  | 'DISPO_OFFER_RECEIVED'
  | 'SOLD'

export interface BuyerMatchRow {
  id: string
  dispoStage: DispoStageValue
  score: number
  createdAt: string
  dispoOfferAmount?: number | null
  buyer: {
    id: string
    contact: {
      firstName: string
      lastName: string | null
      phone: string | null
      email: string | null
    }
  }
}

interface Props {
  propertyId: string
  initialMatches: BuyerMatchRow[]
}

const STAGES: { key: DispoStageValue; label: string; color: string; dot: string }[] = [
  { key: 'POTENTIAL_BUYER', label: 'Potential', color: 'bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
  { key: 'COLD_BUYER',      label: 'Cold',      color: 'bg-blue-50 border-blue-200', dot: 'bg-blue-400' },
  { key: 'WARM_BUYER',      label: 'Warm',      color: 'bg-amber-50 border-amber-200', dot: 'bg-amber-400' },
  { key: 'HOT_BUYER',       label: 'Hot 🔥',    color: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
  { key: 'DISPO_OFFER_RECEIVED', label: 'Offer',     color: 'bg-green-50 border-green-200', dot: 'bg-green-500' },
  { key: 'SOLD',            label: 'Sold',      color: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-600' },
]

function scoreBadge(score: number) {
  const bg =
    score >= 80 ? 'bg-green-100 text-green-700' :
    score >= 50 ? 'bg-amber-100 text-amber-700' :
    'bg-gray-100 text-gray-500'
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${bg}`}>{score}</span>
}

/* ── Buyer Detail Modal (notes, call, sms, view buyer link) ──────────────── */
function BuyerDetailModal({
  match,
  propertyId,
  onClose,
}: {
  match: BuyerMatchRow
  propertyId: string
  onClose: () => void
}) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState<Array<{ id: string; body: string; createdAt: string }>>([])
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [showCall, setShowCall] = useState(false)
  const [showSms, setShowSms] = useState(false)
  const name = [match.buyer.contact.firstName, match.buyer.contact.lastName].filter(Boolean).join(' ')

  // Load existing notes on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetch(`/api/inbox/${propertyId}/messages`)
      .then((r) => r.json())
      .then((resp) => {
        const msgs = resp?.messages ?? resp ?? []
        const buyerNotes = Array.isArray(msgs) ? msgs.filter(
          (m: any) => m.channel === 'NOTE' && m.body?.includes(`[Buyer Note - ${name}]`)
        ) : []
        setNotes(buyerNotes.map((m: any) => ({
          id: m.id,
          body: m.body.replace(`[Buyer Note - ${name}] `, ''),
          createdAt: m.createdAt,
        })))
      })
      .catch(() => {})
      .finally(() => setLoadingNotes(false))
  }, [])

  async function saveNote() {
    if (!note.trim()) return
    setSaving(true)
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          channel: 'NOTE',
          direction: 'OUTBOUND',
          body: `[Buyer Note - ${name}] ${note.trim()}`,
        }),
      })
      toast.success('Note saved')
      setNotes((prev) => [{ id: Date.now().toString(), body: note.trim(), createdAt: new Date().toISOString() }, ...prev])
      setNote('')
    } catch {
      toast.error('Failed to save note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header with View Buyer link */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">{name}</h2>
              <a
                href={`/buyers/${match.buyer.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                title="View buyer details"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-gray-500">
              {STAGES.find(s => s.key === match.dispoStage)?.label}
              {match.dispoOfferAmount != null && match.dispoOfferAmount > 0 && (
                <span className="ml-1 text-green-600 font-semibold"> | Offer: ${match.dispoOfferAmount.toLocaleString()}</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        {/* Contact Info */}
        <div className="space-y-1 mb-4">
          {match.buyer.contact.phone && (
            <p className="text-sm text-gray-600 flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-gray-400" /> {match.buyer.contact.phone}
            </p>
          )}
          {match.buyer.contact.email && (
            <p className="text-sm text-gray-600 flex items-center gap-2">
              <span className="text-gray-400 text-xs">@</span> {match.buyer.contact.email}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => match.buyer.contact.phone && setShowCall(true)}
            disabled={!match.buyer.contact.phone}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Phone className="w-3.5 h-3.5" /> Call
          </button>
          <button
            onClick={() => match.buyer.contact.phone && setShowSms(true)}
            disabled={!match.buyer.contact.phone}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" /> SMS
          </button>
          <a
            href={`/buyers/${match.buyer.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Details
          </a>
        </div>

        {/* Remove from Pipeline */}
        <button
          onClick={async () => {
            if (!confirm(`Remove ${name} from the dispo pipeline for this property?`)) return
            try {
              await fetch(`/api/properties/${propertyId}/buyer-matches/${match.id}`, { method: 'DELETE' })
              toast.success(`${name} removed from pipeline`)
              onClose()
              ;(window as any).showPageLoading?.()
              window.location.reload()
            } catch { toast.error('Failed to remove buyer') }
          }}
          className="w-full mb-4 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors font-medium"
        >
          Remove from Pipeline
        </button>

        {/* Call / SMS modals */}
        {showCall && match.buyer.contact.phone && (
          <InitiateCallModal
            propertyId={propertyId}
            contacts={[{ id: match.buyer.id, name, phone: match.buyer.contact.phone }]}
            propertyAddress={name}
            onClose={() => setShowCall(false)}
          />
        )}
        {showSms && match.buyer.contact.phone && (
          <SendSmsModal
            propertyId={propertyId}
            contacts={[{ id: match.buyer.id, name, phone: match.buyer.contact.phone }]}
            propertyAddress={name}
            onClose={() => setShowSms(false)}
          />
        )}

        {/* Existing Notes */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-2">
            <StickyNote className="w-3.5 h-3.5" /> Notes ({notes.length})
          </p>
          {loadingNotes ? (
            <p className="text-xs text-gray-400">Loading notes...</p>
          ) : notes.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No notes yet</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {notes.map((n) => (
                <NoteItem key={n.id} note={n} name={name} onUpdated={(body) => setNotes(prev => prev.map(x => x.id === n.id ? { ...x, body } : x))} onDeleted={() => setNotes(prev => prev.filter(x => x.id !== n.id))} />
              ))}
            </div>
          )}
        </div>

        {/* Add Note */}
        <div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note about this buyer..."
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
          <button
            onClick={saveNote}
            disabled={saving || !note.trim()}
            className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Note Item with edit/delete ──────────────────────────────────────────── */
function NoteItem({ note, name, onUpdated, onDeleted }: { note: { id: string; body: string; createdAt: string }; name: string; onUpdated: (body: string) => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(note.body)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!editBody.trim()) return
    setBusy(true)
    try {
      await fetch(`/api/messages/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: `[Buyer Note - ${name}] ${editBody.trim()}` }),
      })
      onUpdated(editBody.trim())
      setEditing(false)
      toast.success('Note updated')
    } catch { toast.error('Failed to update') }
    finally { setBusy(false) }
  }

  async function remove() {
    if (!confirm('Delete this note?')) return
    setBusy(true)
    try {
      await fetch(`/api/messages/${note.id}`, { method: 'DELETE' })
      onDeleted()
      toast.success('Note deleted')
    } catch { toast.error('Failed to delete') }
    finally { setBusy(false) }
  }

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 group">
      {editing ? (
        <div className="space-y-1">
          <input value={editBody} onChange={(e) => setEditBody(e.target.value)} className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
          <div className="flex gap-1">
            <button onClick={save} disabled={busy} className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">Save</button>
            <button onClick={() => { setEditing(false); setEditBody(note.body) }} className="text-[10px] text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-start gap-1">
            <p className="text-sm text-gray-700 flex-1">{note.body}</p>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button onClick={() => setEditing(true)} className="p-0.5 text-gray-400 hover:text-blue-600"><Pencil className="w-3 h-3" /></button>
              <button onClick={remove} disabled={busy} className="p-0.5 text-gray-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        </>
      )}
    </div>
  )
}

/* ── Buyer Card ──────────────────────────────────────────────────────────── */
function BuyerCard({
  match,
  propertyId,
  isDragging,
  onClick,
}: {
  match: BuyerMatchRow
  propertyId: string
  isDragging?: boolean
  onClick?: () => void
}) {
  const [showCall, setShowCall] = useState(false)
  const [showSms, setShowSms] = useState(false)
  const name = [match.buyer.contact.firstName, match.buyer.contact.lastName].filter(Boolean).join(' ')
  const date = new Date(match.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <>
      <div
        className={`bg-white border rounded-lg p-3 shadow-sm cursor-pointer hover:border-blue-300 transition-colors ${isDragging ? 'opacity-60 rotate-1 shadow-lg' : ''}`}
        onClick={onClick}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-medium text-gray-900 truncate">{name}</span>
            </div>
            <p className="text-[10px] text-gray-400">Matched {date}</p>
            {match.buyer.contact.phone && (
              <p className="text-[10px] text-gray-500 mt-0.5">{match.buyer.contact.phone}</p>
            )}
            {match.dispoOfferAmount != null && match.dispoOfferAmount > 0 && (
              <p className="text-[10px] font-semibold text-green-600 mt-0.5">${match.dispoOfferAmount.toLocaleString()}</p>
            )}
          </div>
        </div>
        {/* Quick action buttons */}
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
          {match.buyer.contact.phone && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowCall(true) }}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 border border-green-100 rounded hover:bg-green-100 transition-colors"
            >
              <Phone className="w-2.5 h-2.5" /> Call
            </button>
          )}
          {match.buyer.contact.phone && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowSms(true) }}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100 rounded hover:bg-blue-100 transition-colors"
            >
              <MessageSquare className="w-2.5 h-2.5" /> SMS
            </button>
          )}
          <a
            href={`/buyers/${match.buyer.id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="View buyer details"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {showCall && match.buyer.contact.phone && (
        <InitiateCallModal
          propertyId={propertyId}
          contacts={[{ id: match.buyer.id, name, phone: match.buyer.contact.phone }]}
          propertyAddress={name}
          onClose={() => setShowCall(false)}
        />
      )}
      {showSms && match.buyer.contact.phone && (
        <SendSmsModal
          propertyId={propertyId}
          contacts={[{ id: match.buyer.id, name, phone: match.buyer.contact.phone }]}
          propertyAddress={name}
          onClose={() => setShowSms(false)}
        />
      )}
    </>
  )
}

/* ── Sortable Card Wrapper ───────────────────────────────────────────────── */
function SortableBuyerCard({ match, propertyId, onCardClick }: { match: BuyerMatchRow; propertyId: string; onCardClick: (m: BuyerMatchRow) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: match.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} suppressHydrationWarning>
      <div className="flex items-center gap-1">
        <div {...attributes} {...listeners} className="text-gray-300 hover:text-gray-500 p-0.5 flex-shrink-0 cursor-grab active:cursor-grabbing" suppressHydrationWarning>
          <GripVertical className="w-3 h-3" />
        </div>
        <div className="flex-1 min-w-0">
          <BuyerCard match={match} propertyId={propertyId} isDragging={isDragging} onClick={() => onCardClick(match)} />
        </div>
      </div>
    </div>
  )
}

/* ── Offer Amount Modal (shown when moving to DISPO_OFFER_RECEIVED or SOLD) ──── */
function OfferAmountPrompt({ buyerName, propertyId, buyerId, matchId, targetStage, onDone, onCancel }: {
  buyerName: string; propertyId: string; buyerId: string; matchId: string; targetStage: string; onDone: () => void; onCancel: () => void
}) {
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  function fmtCommas(raw: string): string {
    const cleaned = raw.replace(/[^0-9.]/g, '')
    const parts = cleaned.split('.')
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0]
  }

  async function submit() {
    const price = parseFloat(amount.replace(/[^0-9.]/g, ''))
    if (!price || price <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      // Save the offer
      await fetch(`/api/properties/${propertyId}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerId, dispoOfferAmount: price }),
      }).catch(() => {})
      // Move the stage + save offer amount on the match
      await fetch(`/api/properties/${propertyId}/buyer-matches/${matchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispoStage: targetStage, dispoOfferAmount: price }),
      })
      toast.success(`${buyerName} moved to ${STAGES.find(s => s.key === targetStage)?.label} with $${price.toLocaleString()} offer`)
      onDone()
    } catch { toast.error('Failed'); onCancel() }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="bg-blue-600 px-5 py-3 flex items-center justify-between">
          <h2 className="text-white text-sm font-bold">Enter Offer Amount</h2>
          <button onClick={onCancel} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">Offer amount for <strong>{buyerName}</strong></p>
          <div className="flex items-center border border-gray-200 rounded-lg px-3 py-2.5 focus-within:ring-1 focus-within:ring-blue-500">
            <span className="text-sm text-gray-400 mr-1">$</span>
            <input type="text" inputMode="decimal" value={fmtCommas(amount)} onChange={(e) => setAmount(e.target.value.replace(/,/g, ''))} placeholder="0" className="w-full text-sm outline-none" autoFocus />
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Confirm'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main Kanban Component ───────────────────────────────────────────────── */
export function BuyerKanban({ propertyId, initialMatches }: Props) {
  const router = useRouter()
  const [matches, setMatches] = useState<BuyerMatchRow[]>(initialMatches)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<BuyerMatchRow | null>(null)
  const [offerPrompt, setOfferPrompt] = useState<{ matchId: string; buyerName: string; buyerId: string; targetStage: string } | null>(null)

  // Sync local state when property changes (initialMatches prop changes)
  useEffect(() => {
    setMatches(initialMatches)
  }, [propertyId, initialMatches])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } })
  )

  const activeMatch = activeId ? matches.find((m) => m.id === activeId) : null

  const onDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(e.active.id as string)
  }, [])

  const onDragEnd = useCallback(async (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return

    const draggedId = active.id as string
    const overId = over.id as string

    const targetStage = STAGES.find((s) => s.key === overId)?.key
      ?? matches.find((m) => m.id === overId)?.dispoStage

    if (!targetStage) return

    const draggedMatch = matches.find((m) => m.id === draggedId)
    if (!draggedMatch || draggedMatch.dispoStage === targetStage) return

    // If moving to DISPO_OFFER_RECEIVED or SOLD, ask for offer amount first
    if (targetStage === 'DISPO_OFFER_RECEIVED' || targetStage === 'SOLD') {
      const buyerName = [draggedMatch.buyer.contact.firstName, draggedMatch.buyer.contact.lastName].filter(Boolean).join(' ')
      setOfferPrompt({ matchId: draggedId, buyerName, buyerId: draggedMatch.buyer.id, targetStage })
      return
    }

    // Normal stage move
    setMatches((prev) =>
      prev.map((m) => m.id === draggedId ? { ...m, dispoStage: targetStage } : m)
    )

    try {
      const res = await fetch(`/api/properties/${propertyId}/buyer-matches/${draggedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispoStage: targetStage }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Moved to ${STAGES.find(s => s.key === targetStage)?.label}`)
    } catch {
      toast.error('Failed to move buyer')
      setMatches(initialMatches)
    }
  }, [matches, propertyId, initialMatches])

  const [addBuyerStage, setAddBuyerStage] = useState<DispoStageValue | null>(null)

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 h-full overflow-x-auto pb-2">
          {STAGES.map((stage) => {
            const cards = matches.filter((m) => m.dispoStage === stage.key)
            return (
              <KanbanColumn
                key={stage.key}
                stage={stage}
                cards={cards}
                propertyId={propertyId}
                onAddBuyer={() => setAddBuyerStage(stage.key)}
                onCardClick={(m) => setSelectedMatch(m)}
              />
            )
          })}
        </div>
        <DragOverlay>
          {activeMatch && <BuyerCard match={activeMatch} propertyId={propertyId} isDragging />}
        </DragOverlay>
      </DndContext>

      {selectedMatch && (
        <BuyerDetailModal
          match={selectedMatch}
          propertyId={propertyId}
          onClose={() => setSelectedMatch(null)}
        />
      )}

      {addBuyerStage && (
        <AddBuyerToDispoModal
          propertyId={propertyId}
          stage={addBuyerStage}
          onClose={() => setAddBuyerStage(null)}
        />
      )}

      {offerPrompt && (
        <OfferAmountPrompt
          buyerName={offerPrompt.buyerName}
          propertyId={propertyId}
          buyerId={offerPrompt.buyerId}
          matchId={offerPrompt.matchId}
          targetStage={offerPrompt.targetStage}
          onDone={() => { setOfferPrompt(null); (window as any).showPageLoading?.(); window.location.reload() }}
          onCancel={() => setOfferPrompt(null)}
        />
      )}
    </>
  )
}

/* ── Kanban Column ───────────────────────────────────────────────────────── */
function KanbanColumn({
  stage,
  cards,
  propertyId,
  onAddBuyer,
  onCardClick,
}: {
  stage: (typeof STAGES)[number]
  cards: BuyerMatchRow[]
  propertyId: string
  onAddBuyer: () => void
  onCardClick: (m: BuyerMatchRow) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key })

  return (
    <div
      ref={setNodeRef}
      id={stage.key}
      className={`flex-shrink-0 w-52 flex flex-col rounded-xl border ${stage.color} transition-colors ${isOver ? 'ring-2 ring-blue-400 bg-blue-50/50' : ''}`}
    >
      {/* Column header with Add button */}
      <div className="px-3 py-2 flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stage.dot}`} />
        <span className="text-xs font-semibold text-gray-700 truncate">{stage.label}</span>
        <span className="text-[10px] font-medium text-gray-400 bg-white rounded-full px-1.5 py-0.5 border">
          {cards.length}
        </span>
        <button
          onClick={onAddBuyer}
          className="ml-auto p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
          title="Add buyer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Cards */}
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 px-2 pb-2 space-y-2 min-h-[120px]">
          {cards.length === 0 ? (
            <div className="flex items-center justify-center h-16 text-[10px] text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
              No buyers
            </div>
          ) : (
            cards.map((match) => (
              <SortableBuyerCard key={match.id} match={match} propertyId={propertyId} onCardClick={onCardClick} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}
