'use client'

/**
 * TemplatesPanel
 *
 * Manage message & task templates: SMS, Email, RVM, Task, Direct Mail.
 * CRUD operations via /api/templates endpoints.
 *
 * Calls:
 *   GET    /api/templates          — list all (optional ?type=)
 *   POST   /api/templates          — create
 *   PATCH  /api/templates/[id]     — update
 *   DELETE /api/templates/[id]     — delete
 */

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Loader2, Pencil, Save, X } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

const TEMPLATE_TYPES = [
  { key: 'sms', label: 'SMS' },
  { key: 'email', label: 'Email' },
  { key: 'rvm', label: 'RVM' },
  { key: 'task', label: 'Task' },
  { key: 'direct_mail', label: 'Direct Mail' },
] as const

type TemplateTypeKey = (typeof TEMPLATE_TYPES)[number]['key']

interface Template {
  id: string
  templateType: string
  name: string
  category: string | null
  subject: string | null
  bodyContent: string
  isActive: boolean
  createdAt: string
}

interface TemplateDraft {
  name: string
  category: string
  subject: string
  bodyContent: string
  isActive: boolean
}

function emptyDraft(): TemplateDraft {
  return { name: '', category: '', subject: '', bodyContent: '', isActive: true }
}

function toDraft(t: Template): TemplateDraft {
  return {
    name: t.name,
    category: t.category ?? '',
    subject: t.subject ?? '',
    bodyContent: t.bodyContent,
    isActive: t.isActive,
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TemplatesPanel() {
  const [activeType, setActiveType] = useState<TemplateTypeKey>('sms')
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit / create state
  const [editingId, setEditingId] = useState<string | null>(null) // 'new' or template id
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load templates')
      }
      const json = await res.json()
      // The API returns either `{ data: Template[] }` or a raw array — tolerate both.
      const list: Template[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
          ? json.data
          : []
      setTemplates(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  // Filter templates for current tab
  const filtered = templates.filter((t) => t.templateType === activeType)

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function startNew() {
    setDraft(emptyDraft())
    setEditingId('new')
    setError(null)
  }

  function startEdit(t: Template) {
    setDraft(toDraft(t))
    setEditingId(t.id)
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(emptyDraft())
  }

  async function handleSave() {
    if (!draft.name.trim()) {
      setError('Template name is required')
      return
    }
    if (!draft.bodyContent.trim()) {
      setError('Body content is required')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      templateType: activeType,
      name: draft.name.trim(),
      category: draft.category.trim() || null,
      subject: activeType === 'email' ? (draft.subject.trim() || null) : null,
      bodyContent: draft.bodyContent,
      isActive: draft.isActive,
    }

    try {
      const isNew = editingId === 'new'
      const url = isNew ? '/api/templates' : `/api/templates/${editingId}`
      const method = isNew ? 'POST' : 'PATCH'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to save template')
      }

      await fetchTemplates()
      setEditingId(null)
      setDraft(emptyDraft())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return
    setDeleting(id)
    setError(null)

    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete template')
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      if (editingId === id) {
        setEditingId(null)
        setDraft(emptyDraft())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting')
    } finally {
      setDeleting(null)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading templates...
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Templates</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage reusable message and task templates.
          </p>
        </div>
        <button
          onClick={startNew}
          disabled={editingId === 'new'}
          className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Template
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Type tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TEMPLATE_TYPES.map((tt) => (
          <button
            key={tt.key}
            onClick={() => {
              setActiveType(tt.key)
              cancelEdit()
            }}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeType === tt.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tt.label}
          </button>
        ))}
      </div>

      {/* Inline form for new/edit */}
      {editingId && (
        <div className="bg-white border-2 border-blue-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
            <span className="text-sm font-medium text-blue-800">
              {editingId === 'new' ? 'New Template' : 'Edit Template'}
            </span>
          </div>
          <div className="px-4 py-4 space-y-3">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Initial Contact SMS"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Category <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                placeholder="e.g. Follow-up, Outreach"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Subject (email only) */}
            {activeType === 'email' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                <input
                  type="text"
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  placeholder="Email subject line"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Body */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Body Content</label>
              <textarea
                value={draft.bodyContent}
                onChange={(e) => setDraft({ ...draft, bodyContent: e.target.value })}
                placeholder="Template body content..."
                rows={6}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600">Status</label>
              <button
                onClick={() => setDraft({ ...draft, isActive: !draft.isActive })}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  draft.isActive
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-gray-50 border-gray-300 text-gray-500'
                }`}
              >
                {draft.isActive ? 'Active' : 'Inactive'}
              </button>
            </div>

            {/* Save / Cancel */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates table */}
      {filtered.length === 0 && !editingId && (
        <p className="text-sm text-gray-400 py-6 text-center">
          No templates yet for this type. Click &quot;+ Add Template&quot; to create one.
        </p>
      )}

      {filtered.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tmpl) => (
                <tr
                  key={tmpl.id}
                  className="border-b border-gray-100 last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{tmpl.name}</span>
                      {!tmpl.isActive && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          Inactive
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{tmpl.category || '-'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(tmpl.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => startEdit(tmpl)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(tmpl.id)}
                        disabled={deleting === tmpl.id}
                        className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50 rounded-lg hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        {deleting === tmpl.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
