'use client'

import { useState, useEffect } from 'react'
import { StickyNote, Building2, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  buyerName: string
  buyerId: string
  matchedPropertyIds: string[]
  /** Pre-resolved property addresses keyed by propertyId */
  propertyAddresses?: Record<string, string>
}

interface NoteEntry {
  id: string
  body: string
  createdAt: string
  propertyId?: string
  propertyAddress?: string
}

function EditableNote({ note, tag, variant, onUpdated, onDeleted }: { note: NoteEntry; tag: string; variant?: 'property'; onUpdated: (body: string) => void; onDeleted: () => void }) {
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
        body: JSON.stringify({ body: `${tag} ${editBody.trim()}` }),
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

  const bg = variant === 'property' ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100'

  return (
    <div className={`${bg} border rounded-lg px-3 py-2 group`}>
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
            {note.propertyAddress && <span className="ml-1">• {note.propertyAddress}</span>}
          </p>
        </>
      )}
    </div>
  )
}

export function BuyerNotesCard({ buyerName, buyerId, matchedPropertyIds, propertyAddresses }: Props) {
  const [propertyNotes, setPropertyNotes] = useState<NoteEntry[]>([])
  const [genericNotes, setGenericNotes] = useState<NoteEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [newPropertyNote, setNewPropertyNote] = useState('')
  const [selectedPropertyId, setSelectedPropertyId] = useState(matchedPropertyIds[0] ?? '')
  const [propertyMap, setPropertyMap] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [savingGeneric, setSavingGeneric] = useState(false)

  const GENERIC_TAG = `[Buyer General - ${buyerName}]`
  const PROPERTY_TAG = `[Buyer Note - ${buyerName}]`

  useEffect(() => {
    if (matchedPropertyIds.length === 0) {
      setLoading(false)
      return
    }

    // Use pre-resolved addresses if provided
    if (propertyAddresses) {
      setPropertyMap(propertyAddresses)
    }

    Promise.all(
      matchedPropertyIds.map((pid) =>
        fetch(`/api/inbox/${pid}/messages`)
          .then((r) => r.json())
          .then((resp: any) => {
            const msgs = resp?.messages ?? resp ?? []
            const filtered = (Array.isArray(msgs) ? msgs : []).filter(
              (m: any) => m.channel === 'NOTE' && (m.body?.includes(PROPERTY_TAG) || m.body?.includes(GENERIC_TAG))
            )
            return filtered.map((m: any) => ({
              id: m.id,
              body: m.body.replace(PROPERTY_TAG + ' ', '').replace(GENERIC_TAG + ' ', ''),
              createdAt: m.createdAt,
              propertyId: pid,
              propertyAddress: m.property?.streetAddress,
              isGeneric: m.body?.startsWith(GENERIC_TAG),
            }))
          })
          .catch(() => [])
      )
    ).then((results) => {
      const all = results.flat()
      const generic = all.filter((n: any) => n.isGeneric).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      const byProperty = all.filter((n: any) => !n.isGeneric).sort((a, b) => {
        // Sort by property first, then by date
        if (a.propertyAddress !== b.propertyAddress) return (a.propertyAddress ?? '').localeCompare(b.propertyAddress ?? '')
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
      setGenericNotes(generic)
      setPropertyNotes(byProperty)
      setLoading(false)
    })
  }, [buyerName, matchedPropertyIds]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveGenericNote() {
    if (!newNote.trim() || matchedPropertyIds.length === 0) return
    setSavingGeneric(true)
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: matchedPropertyIds[0],
          channel: 'NOTE',
          direction: 'OUTBOUND',
          body: `${GENERIC_TAG} ${newNote.trim()}`,
        }),
      })
      toast.success('Note saved')
      setGenericNotes((prev) => [{ id: Date.now().toString(), body: newNote.trim(), createdAt: new Date().toISOString() }, ...prev])
      setNewNote('')
    } catch {
      toast.error('Failed to save note')
    } finally {
      setSavingGeneric(false)
    }
  }

  async function savePropertyNote() {
    if (!newPropertyNote.trim() || !selectedPropertyId) return
    setSaving(true)
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedPropertyId,
          channel: 'NOTE',
          direction: 'OUTBOUND',
          body: `${PROPERTY_TAG} ${newPropertyNote.trim()}`,
        }),
      })
      toast.success('Note saved')
      setPropertyNotes((prev) => [{
        id: Date.now().toString(),
        body: newPropertyNote.trim(),
        createdAt: new Date().toISOString(),
        propertyId: selectedPropertyId,
        propertyAddress: propertyMap[selectedPropertyId] ?? selectedPropertyId.slice(0, 8),
      }, ...prev])
      setNewPropertyNote('')
    } catch {
      toast.error('Failed to save note')
    } finally {
      setSaving(false)
    }
  }

  // Group property notes by property — use propertyMap for display names
  const groupedByProperty: Record<string, { label: string; notes: NoteEntry[] }> = {}
  for (const n of propertyNotes) {
    const pid = n.propertyId ?? 'unknown'
    const label = propertyMap[pid] ?? n.propertyAddress ?? pid.slice(0, 12) + '...'
    if (!groupedByProperty[pid]) groupedByProperty[pid] = { label, notes: [] }
    groupedByProperty[pid].notes.push(n)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="space-y-4">
      {/* Generic Notes */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
          <StickyNote className="w-4 h-4" />
          Notes ({genericNotes.length})
        </h3>

        {loading ? (
          <p className="text-xs text-gray-400">Loading...</p>
        ) : genericNotes.length === 0 ? (
          <p className="text-xs text-gray-400 italic mb-3">No general notes yet</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
            {genericNotes.map((n) => (
              <EditableNote key={n.id} note={n} tag={GENERIC_TAG} onUpdated={(body) => setGenericNotes(prev => prev.map(x => x.id === n.id ? { ...x, body } : x))} onDeleted={() => setGenericNotes(prev => prev.filter(x => x.id !== n.id))} />
            ))}
          </div>
        )}

        {matchedPropertyIds.length > 0 && (
          <div className="flex gap-2">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a general note..."
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && saveGenericNote()}
            />
            <button
              onClick={saveGenericNote}
              disabled={savingGeneric || !newNote.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {savingGeneric ? '...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Property-Specific Notes */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-2">
          <Building2 className="w-4 h-4" />
          Property Notes ({propertyNotes.length})
        </h3>

        {/* Property selector dropdown — right below heading */}
        {matchedPropertyIds.length > 0 && (
          <select
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-blue-50 mb-3"
          >
            {matchedPropertyIds.map((pid) => (
              <option key={pid} value={pid}>
                {propertyMap[pid] || 'Loading address...'}
              </option>
            ))}
          </select>
        )}

        {/* Notes for selected property */}
        {loading ? (
          <p className="text-xs text-gray-400">Loading...</p>
        ) : (() => {
          const selectedNotes = propertyNotes.filter(n => n.propertyId === selectedPropertyId)
          return selectedNotes.length === 0 ? (
            <p className="text-xs text-gray-400 italic mb-3">No notes for this property yet</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto mb-3">
              {selectedNotes.map((n) => (
                <EditableNote key={n.id} note={n} tag={PROPERTY_TAG} variant="property" onUpdated={(body) => setPropertyNotes(prev => prev.map(x => x.id === n.id ? { ...x, body } : x))} onDeleted={() => setPropertyNotes(prev => prev.filter(x => x.id !== n.id))} />
              ))}
            </div>
          )
        })()}

        {/* Add note input */}
        {matchedPropertyIds.length > 0 && (
          <div className="flex gap-2">
            <input
              value={newPropertyNote}
              onChange={(e) => setNewPropertyNote(e.target.value)}
              placeholder="Add a note for this property..."
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && savePropertyNote()}
            />
            <button
              onClick={savePropertyNote}
              disabled={saving || !newPropertyNote.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? '...' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
