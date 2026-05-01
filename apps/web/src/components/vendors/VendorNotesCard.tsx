'use client'

import { useState } from 'react'
import { StickyNote } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  vendorId: string
  initialNotes: string | null
}

export function VendorNotesCard({ vendorId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialNotes ?? '')
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setDraft(notes)
    setEditing(true)
  }

  function cancel() {
    setDraft(notes)
    setEditing(false)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/vendors/${vendorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: draft.trim() || null }),
      })
      if (!res.ok) throw new Error('Failed to save notes.')
      setNotes(draft.trim())
      setEditing(false)
      toast.success('Notes saved.')
    } catch {
      toast.error('Failed to save notes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <StickyNote className="w-4 h-4" />
          Notes
        </h3>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="text-[11px] font-medium text-blue-600 hover:text-blue-800"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Add notes about this vendor…"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : notes ? (
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{notes}</p>
      ) : (
        <p className="text-xs text-gray-400 italic">No notes yet. Click Edit to add one.</p>
      )}
    </div>
  )
}
