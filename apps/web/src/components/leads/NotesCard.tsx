'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Pencil, Trash2, Check, X } from 'lucide-react'

interface Note {
  id: string
  body: string
  createdAt: Date
  authorName: string | null
}

interface Props {
  propertyId: string
  notes: Note[]
}

export function NotesCard({ propertyId, notes }: Props) {
  const router = useRouter()
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function addNote() {
    if (!content.trim()) return
    setError(null)
    const res = await fetch(`/api/leads/${propertyId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) { setError('Failed to save note'); return }
    setContent('')
    startTransition(() => router.refresh())
  }

  function startEdit(note: Note) {
    setEditingId(note.id)
    setEditBody(note.body)
  }

  async function saveEdit(noteId: string) {
    if (!editBody.trim()) return
    const res = await fetch(`/api/leads/${propertyId}/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: editBody }),
    })
    if (res.ok) {
      setEditingId(null)
      setEditBody('')
      startTransition(() => router.refresh())
    }
  }

  async function deleteNote(noteId: string) {
    if (!confirm('Delete this note?')) return
    setDeletingId(noteId)
    try {
      await fetch(`/api/leads/${propertyId}/notes/${noteId}`, { method: 'DELETE' })
      startTransition(() => router.refresh())
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">Notes</h3>

      <div className="mb-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a note..."
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        <button
          className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 active:scale-95"
          disabled={isPending || !content.trim()}
          onClick={addNote}
        >
          {isPending ? 'Saving...' : 'Add Note'}
        </button>
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-none">
        {notes.length === 0 ? (
          <p className="text-sm text-gray-400">No notes yet</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="border-b border-gray-50 pb-3 last:border-0 group">
              {editingId === note.id ? (
                /* Edit mode */
                <div>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                    autoFocus
                    className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(note.id) }}
                  />
                  <div className="flex items-center gap-1 mt-1.5">
                    <button
                      onClick={() => saveEdit(note.id)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors active:scale-95"
                    >
                      <Check className="w-3 h-3" /> Save
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setEditBody('') }}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.body}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {note.authorName ?? 'Unknown'} · {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => startEdit(note)}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Edit note"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteNote(note.id)}
                      disabled={deletingId === note.id}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50 transition-colors"
                      title="Delete note"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
