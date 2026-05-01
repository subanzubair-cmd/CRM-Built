'use client'

/**
 * ContactSourcesPanel — reusable CRUD for buyer / vendor source lists.
 *
 * API (backed by CompanySettings JSONB arrays):
 *   GET    /api/contact-sources?type=buyer|vendor   — string[]
 *   POST   /api/contact-sources  { type, name }     — add
 *   DELETE /api/contact-sources?type=buyer|vendor&name=...  — remove
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Check, X, Trash2, Loader2 } from 'lucide-react'

interface Props {
  /** 'buyer' or 'vendor' — drives the API query parameter. */
  type: 'buyer' | 'vendor'
}

export function ContactSourcesPanel({ type }: Props) {
  const [sources, setSources] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [deletingName, setDeletingName] = useState<string | null>(null)

  const label = type === 'buyer' ? 'Buyer' : 'Vendor'

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch(`/api/contact-sources?type=${type}`)
      if (!res.ok) throw new Error('Failed to load sources')
      const json = await res.json()
      setSources(json.data ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load sources')
    } finally {
      setLoading(false)
    }
  }, [type])

  useEffect(() => {
    fetchSources()
  }, [fetchSources])

  async function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const res = await fetch('/api/contact-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name: trimmed }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error ?? 'Failed to add source')
      }
      setSources(json.data ?? [])
      toast.success(`Added "${trimmed}"`)
      setNewName('')
      setAddOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add source')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    setDeletingName(name)
    try {
      const res = await fetch(
        `/api/contact-sources?type=${type}&name=${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error ?? 'Failed to delete')
      }
      setSources(json.data ?? [])
      toast.success('Deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeletingName(null)
    }
  }

  /** Rename = delete old + add new. */
  async function handleRename(idx: number) {
    const trimmed = editName.trim()
    const original = sources[idx]
    if (!trimmed || trimmed === original) {
      setEditingIdx(null)
      return
    }
    setSaving(true)
    try {
      // Delete old
      const delRes = await fetch(
        `/api/contact-sources?type=${type}&name=${encodeURIComponent(original)}`,
        { method: 'DELETE' },
      )
      if (!delRes.ok) throw new Error('Rename failed (delete step)')

      // Add new
      const addRes = await fetch('/api/contact-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name: trimmed }),
      })
      const json = await addRes.json().catch(() => ({}))
      if (!addRes.ok) throw new Error(json?.error ?? 'Rename failed (add step)')

      setSources(json.data ?? [])
      toast.success('Renamed')
      setEditingIdx(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rename failed')
      // Refresh to get consistent state
      fetchSources()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{label} Sources</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage the &ldquo;How did you hear about us?&rdquo; options for {label.toLowerCase()} contacts.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Source
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide">
                Name
              </th>
              <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wide">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Loading...
                </td>
              </tr>
            ) : sources.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-gray-400">
                  No {label.toLowerCase()} sources yet. Click &quot;Add Source&quot; to create one.
                </td>
              </tr>
            ) : (
              sources.map((source, idx) => {
                const isEditing = editingIdx === idx
                return (
                  <tr key={source} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(idx)
                              if (e.key === 'Escape') setEditingIdx(null)
                            }}
                            autoFocus
                            className="text-sm border border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => handleRename(idx)}
                            disabled={saving}
                            className="p-1 text-blue-600 hover:text-blue-800 rounded hover:bg-blue-50 disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingIdx(null)}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="group flex items-center gap-1.5 cursor-pointer"
                          onClick={() => {
                            setEditingIdx(idx)
                            setEditName(source)
                          }}
                        >
                          <span className="font-medium text-gray-800">{source}</span>
                          <Pencil className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => handleDelete(source)}
                        disabled={deletingName === source}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        {deletingName === source ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Source modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-[15px] font-semibold text-gray-900">Add {label} Source</h2>
              <button
                onClick={() => {
                  setAddOpen(false)
                  setNewName('')
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">
                  Source Name *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="e.g. Facebook Ads, Referral, Door Knock"
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100 rounded-b-xl">
              <button
                onClick={() => {
                  setAddOpen(false)
                  setNewName('')
                }}
                className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !newName.trim()}
                className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
