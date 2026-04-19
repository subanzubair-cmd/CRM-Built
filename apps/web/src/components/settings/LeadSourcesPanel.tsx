'use client'

/**
 * LeadSourcesPanel
 *
 * Admin CRUD for LeadSource entries.
 *
 * API:
 *   GET    /api/lead-sources           — list
 *   POST   /api/lead-sources           — create
 *   PATCH  /api/lead-sources/[id]      — rename / toggle isActive
 *   DELETE /api/lead-sources/[id]      — hard delete (non-system, no refs)
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Check, X, Trash2, Loader2 } from 'lucide-react'

interface LeadSource {
  id: string
  name: string
  isActive: boolean
  isSystem: boolean
}

export function LeadSourcesPanel() {
  const [sources, setSources] = useState<LeadSource[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch('/api/lead-sources')
      if (!res.ok) throw new Error('Failed to load lead sources')
      const json = await res.json()
      setSources(json.data ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load lead sources')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSources()
  }, [fetchSources])

  async function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const res = await fetch('/api/lead-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error ?? 'Failed to create lead source')
      }
      setSources((prev) => [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success(`Added "${json.data.name}"`)
      setNewName('')
      setAddOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create lead source')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(source: LeadSource) {
    if (source.isSystem) return
    setEditingId(source.id)
    setEditName(source.name)
  }

  async function handleRename(id: string) {
    const trimmed = editName.trim()
    const original = sources.find((s) => s.id === id)
    if (!original) return
    if (!trimmed || trimmed === original.name) {
      setEditingId(null)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/lead-sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Failed to rename')
      }
      setSources((prev) =>
        prev.map((s) => (s.id === id ? json.data : s)).sort((a, b) => a.name.localeCompare(b.name)),
      )
      toast.success('Renamed')
      setEditingId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(source: LeadSource) {
    setTogglingId(source.id)
    try {
      const res = await fetch(`/api/lead-sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !source.isActive }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Failed to update status')
      }
      setSources((prev) => prev.map((s) => (s.id === source.id ? json.data : s)))
      toast.success(json.data.isActive ? 'Activated' : 'Deactivated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(source: LeadSource) {
    if (source.isSystem) return
    if (!confirm(`Delete "${source.name}"? This cannot be undone.`)) return
    setDeletingId(source.id)
    try {
      const res = await fetch(`/api/lead-sources/${source.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Failed to delete')
      }
      if (json.deleted) {
        setSources((prev) => prev.filter((s) => s.id !== source.id))
        toast.success('Deleted')
      } else {
        // Soft-deactivated (had references) — refresh state from server
        setSources((prev) =>
          prev.map((s) => (s.id === source.id ? { ...s, isActive: false } : s)),
        )
        toast.success('Deactivated (source was in use)')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Lead Sources</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage the list of channels leads can come from.
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
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide">
                Status
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide">
                Type
              </th>
              <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wide">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Loading...
                </td>
              </tr>
            ) : sources.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No lead sources yet. Click &quot;Add Source&quot; to create one.
                </td>
              </tr>
            ) : (
              sources.map((source) => {
                const isEditing = editingId === source.id
                return (
                  <tr key={source.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(source.id)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            autoFocus
                            className="text-sm border border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => handleRename(source.id)}
                            disabled={saving}
                            className="p-1 text-blue-600 hover:text-blue-800 rounded hover:bg-blue-50 disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className={`group flex items-center gap-1.5 ${
                            source.isSystem ? '' : 'cursor-pointer'
                          }`}
                          onClick={() => startEdit(source)}
                        >
                          <span className="font-medium text-gray-800">{source.name}</span>
                          {!source.isSystem && (
                            <Pencil className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => toggleActive(source)}
                        disabled={togglingId === source.id}
                        className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors disabled:opacity-50 ${
                          source.isActive
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {togglingId === source.id ? (
                          <Loader2 className="w-3 h-3 animate-spin inline" />
                        ) : source.isActive ? (
                          'Active'
                        ) : (
                          'Inactive'
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          source.isSystem
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {source.isSystem ? 'System' : 'Custom'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!source.isSystem && (
                        <button
                          onClick={() => handleDelete(source)}
                          disabled={deletingId === source.id}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === source.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
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
              <h2 className="text-[15px] font-semibold text-gray-900">Add Lead Source</h2>
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
