'use client'

/**
 * AutomationsPanel
 *
 * Manage automation rules: list, create, edit, delete.
 * Each automation has a trigger, conditions, and ordered actions.
 *
 * Calls:
 *   GET    /api/automations          — list all
 *   POST   /api/automations          — create
 *   PATCH  /api/automations/[id]     — update
 *   DELETE /api/automations/[id]     — delete
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  Save,
  X,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

const TRIGGERS = [
  'STAGE_CHANGE',
  'LEAD_CREATED',
  'TAG_ADDED',
  'NO_CONTACT_X_DAYS',
  'OFFER_MADE',
  'UNDER_CONTRACT',
  'MANUAL',
] as const

const ACTION_TYPES = [
  'SEND_SMS',
  'SEND_EMAIL',
  'SEND_RVM',
  'ADD_TAG',
  'CHANGE_STAGE',
  'ASSIGN_USER',
  'CREATE_TASK',
  'ENROLL_CAMPAIGN',
] as const

type Trigger = (typeof TRIGGERS)[number]
type ActionType = (typeof ACTION_TYPES)[number]

interface AutomationAction {
  id?: string
  order: number
  actionType: ActionType
  config: Record<string, unknown>
}

interface Automation {
  id: string
  name: string
  description: string | null
  trigger: Trigger
  conditions: Record<string, unknown>
  isActive: boolean
  actions: AutomationAction[]
  createdAt: string
}

// Draft form state (for new/editing)
interface AutomationDraft {
  name: string
  trigger: Trigger
  isActive: boolean
  actions: { actionType: ActionType; config: string }[]
}

const TRIGGER_LABELS: Record<Trigger, string> = {
  STAGE_CHANGE: 'Stage Change',
  LEAD_CREATED: 'Lead Created',
  TAG_ADDED: 'Tag Added',
  NO_CONTACT_X_DAYS: 'No Contact X Days',
  OFFER_MADE: 'Offer Made',
  UNDER_CONTRACT: 'Under Contract',
  MANUAL: 'Manual',
}

const ACTION_LABELS: Record<ActionType, string> = {
  SEND_SMS: 'Send SMS',
  SEND_EMAIL: 'Send Email',
  SEND_RVM: 'Send RVM',
  ADD_TAG: 'Add Tag',
  CHANGE_STAGE: 'Change Stage',
  ASSIGN_USER: 'Assign User',
  CREATE_TASK: 'Create Task',
  ENROLL_CAMPAIGN: 'Enroll in Campaign',
}

const TRIGGER_COLORS: Record<Trigger, string> = {
  STAGE_CHANGE: 'bg-blue-100 text-blue-700',
  LEAD_CREATED: 'bg-green-100 text-green-700',
  TAG_ADDED: 'bg-purple-100 text-purple-700',
  NO_CONTACT_X_DAYS: 'bg-amber-100 text-amber-700',
  OFFER_MADE: 'bg-blue-100 text-blue-700',
  UNDER_CONTRACT: 'bg-indigo-100 text-indigo-700',
  MANUAL: 'bg-gray-100 text-gray-600',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyDraft(): AutomationDraft {
  return { name: '', trigger: 'STAGE_CHANGE', isActive: true, actions: [] }
}

function toDraft(a: Automation): AutomationDraft {
  return {
    name: a.name,
    trigger: a.trigger,
    isActive: a.isActive,
    actions: a.actions.map((act) => ({
      actionType: act.actionType,
      config: JSON.stringify(act.config, null, 2),
    })),
  }
}

function parseConfig(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}')
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AutomationsPanel() {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Which automation is expanded (or 'new' for new-form)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AutomationDraft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAutomations = useCallback(async () => {
    try {
      const res = await fetch('/api/automations')
      if (!res.ok) throw new Error('Failed to load automations')
      const data = await res.json()
      setAutomations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading automations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAutomations()
  }, [fetchAutomations])

  // ─── Toggle active ──────────────────────────────────────────────────────────

  async function toggleActive(automation: Automation) {
    setToggling(automation.id)
    setError(null)
    try {
      const res = await fetch(`/api/automations/${automation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !automation.isActive }),
      })
      if (!res.ok) throw new Error('Failed to toggle automation')
      setAutomations((prev) =>
        prev.map((a) =>
          a.id === automation.id ? { ...a, isActive: !a.isActive } : a,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setToggling(null)
    }
  }

  // ─── Save (create or update) ────────────────────────────────────────────────

  async function handleSave() {
    if (!draft.name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      name: draft.name.trim(),
      trigger: draft.trigger,
      isActive: draft.isActive,
      conditions: {},
      actions: draft.actions.map((a, i) => ({
        order: i,
        actionType: a.actionType,
        config: parseConfig(a.config),
      })),
    }

    try {
      const isNew = expandedId === 'new'
      const url = isNew
        ? '/api/automations'
        : `/api/automations/${expandedId}`
      const method = isNew ? 'POST' : 'PATCH'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to save automation')
      }

      await fetchAutomations()
      setExpandedId(null)
      setDraft(emptyDraft())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving')
    } finally {
      setSaving(false)
    }
  }

  // ─── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!confirm('Delete this automation rule? This cannot be undone.')) return
    setDeleting(id)
    setError(null)
    try {
      const res = await fetch(`/api/automations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete automation')
      setAutomations((prev) => prev.filter((a) => a.id !== id))
      if (expandedId === id) {
        setExpandedId(null)
        setDraft(emptyDraft())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting')
    } finally {
      setDeleting(null)
    }
  }

  // ─── Expand / collapse ──────────────────────────────────────────────────────

  function expand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setDraft(emptyDraft())
      return
    }
    if (id === 'new') {
      setDraft(emptyDraft())
    } else {
      const auto = automations.find((a) => a.id === id)
      if (auto) setDraft(toDraft(auto))
    }
    setExpandedId(id)
    setError(null)
  }

  // ─── Draft helpers ──────────────────────────────────────────────────────────

  function updateDraft(patch: Partial<AutomationDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  function addAction() {
    setDraft((prev) => ({
      ...prev,
      actions: [...prev.actions, { actionType: 'SEND_SMS', config: '{}' }],
    }))
  }

  function removeAction(idx: number) {
    setDraft((prev) => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== idx),
    }))
  }

  function updateAction(
    idx: number,
    patch: Partial<{ actionType: ActionType; config: string }>,
  ) {
    setDraft((prev) => ({
      ...prev,
      actions: prev.actions.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }))
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading automations...
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Automations</h3>
        <button
          onClick={() => expand('new')}
          disabled={expandedId === 'new'}
          className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Rule
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* New automation form */}
      {expandedId === 'new' && (
        <div className="bg-white border-2 border-blue-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
            <span className="text-sm font-medium text-blue-800">New Automation Rule</span>
          </div>
          <InlineForm
            draft={draft}
            updateDraft={updateDraft}
            addAction={addAction}
            removeAction={removeAction}
            updateAction={updateAction}
            onSave={handleSave}
            onCancel={() => { setExpandedId(null); setDraft(emptyDraft()) }}
            saving={saving}
          />
        </div>
      )}

      {/* List */}
      {automations.length === 0 && expandedId !== 'new' && (
        <p className="text-sm text-gray-400 py-6 text-center">
          No automation rules yet. Click &quot;+ Add Rule&quot; to create one.
        </p>
      )}

      {automations.map((automation) => (
        <div
          key={automation.id}
          className="bg-white border border-gray-200 rounded-xl overflow-hidden"
        >
          {/* Row header */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="font-medium text-sm text-gray-900 truncate">
                {automation.name}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${TRIGGER_COLORS[automation.trigger]}`}
              >
                {TRIGGER_LABELS[automation.trigger]}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {automation.actions.length} action
                {automation.actions.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Active toggle */}
              <button
                onClick={() => toggleActive(automation)}
                disabled={toggling === automation.id}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  automation.isActive ? 'bg-blue-500' : 'bg-gray-300'
                }`}
                title={automation.isActive ? 'Active' : 'Inactive'}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    automation.isActive ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>

              {/* Delete */}
              <button
                onClick={() => handleDelete(automation.id)}
                disabled={deleting === automation.id}
                className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50 rounded-lg hover:bg-red-50 transition-colors"
              >
                {deleting === automation.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Expand */}
              <button
                onClick={() => expand(automation.id)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {expandedId === automation.id ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Expanded edit form */}
          {expandedId === automation.id && (
            <div className="border-t border-gray-100">
              <InlineForm
                draft={draft}
                updateDraft={updateDraft}
                addAction={addAction}
                removeAction={removeAction}
                updateAction={updateAction}
                onSave={handleSave}
                onCancel={() => { setExpandedId(null); setDraft(emptyDraft()) }}
                saving={saving}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── InlineForm sub-component ─────────────────────────────────────────────────

interface InlineFormProps {
  draft: AutomationDraft
  updateDraft: (p: Partial<AutomationDraft>) => void
  addAction: () => void
  removeAction: (i: number) => void
  updateAction: (i: number, p: Partial<{ actionType: ActionType; config: string }>) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}

function InlineForm({
  draft,
  updateDraft,
  addAction,
  removeAction,
  updateAction,
  onSave,
  onCancel,
  saving,
}: InlineFormProps) {
  return (
    <div className="px-4 py-4 space-y-4">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => updateDraft({ name: e.target.value })}
          placeholder="e.g. Auto-assign new leads"
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Trigger + Active */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Trigger</label>
          <select
            value={draft.trigger}
            onChange={(e) => updateDraft({ trigger: e.target.value as Trigger })}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {TRIGGERS.map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <button
            onClick={() => updateDraft({ isActive: !draft.isActive })}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              draft.isActive
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-gray-50 border-gray-300 text-gray-500'
            }`}
          >
            {draft.isActive ? 'Active' : 'Inactive'}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-600">Actions</label>
          <button
            onClick={addAction}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add Action
          </button>
        </div>

        {draft.actions.length === 0 && (
          <p className="text-xs text-gray-400 py-2">
            No actions yet. Add an action to define what happens when this rule triggers.
          </p>
        )}

        <div className="space-y-2">
          {draft.actions.map((action, idx) => (
            <div
              key={idx}
              className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono w-5">
                    #{idx + 1}
                  </span>
                  <select
                    value={action.actionType}
                    onChange={(e) =>
                      updateAction(idx, {
                        actionType: e.target.value as ActionType,
                      })
                    }
                    className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {ACTION_TYPES.map((at) => (
                      <option key={at} value={at}>
                        {ACTION_LABELS[at]}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => removeAction(idx)}
                  className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                value={action.config}
                onChange={(e) => updateAction(idx, { config: e.target.value })}
                placeholder='{"key": "value"}'
                rows={2}
                className="w-full text-xs font-mono border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none bg-white"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Save / Cancel */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onSave}
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
          onClick={onCancel}
          disabled={saving}
          className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
