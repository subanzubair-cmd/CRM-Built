'use client'

/**
 * PipelineManagementPanel
 *
 * Settings panel that lets users view and customise the stages for
 * each pipeline (DTS Leads, DTA Leads, TM, Inventory, Dispo).
 *
 * - Add new custom stages
 * - Rename stage labels
 * - Reorder stages via drag (up / down arrows)
 * - Delete custom stages (system stages are protected)
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Plus, Trash2, GripVertical, ChevronUp, ChevronDown,
  Lock, Pencil, Check, X,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Pipeline definitions ────────────────────────────────────────────────────

const PIPELINES = [
  { key: 'dts_leads', label: 'DTS Leads' },
  { key: 'dta_leads', label: 'DTA Leads' },
  { key: 'tm', label: 'Transaction Management' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'dispo', label: 'Dispo' },
] as const

type PipelineKey = (typeof PIPELINES)[number]['key']

// ── Types ───────────────────────────────────────────────────────────────────

interface Stage {
  id: string
  pipeline: string
  stageCode: string
  label: string
  color: string | null
  sortOrder: number
  isSystem: boolean
  isActive: boolean
}

// ── Component ───────────────────────────────────────────────────────────────

export function PipelineManagementPanel() {
  const [activePipeline, setActivePipeline] = useState<PipelineKey>('dts_leads')
  const [stages, setStages] = useState<Stage[]>([])
  const [allStages, setAllStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add-stage form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [addingStage, setAddingStage] = useState(false)

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')

  // ─── Fetch ──────────────────────────────────────────────────────────────
  const fetchStages = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline-stages')
      if (!res.ok) throw new Error('Failed to load stages')
      const data = await res.json()
      setAllStages(data.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading stages')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStages()
  }, [fetchStages])

  // Filter to active pipeline
  useEffect(() => {
    setStages(
      allStages
        .filter((s) => s.pipeline === activePipeline)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    )
  }, [allStages, activePipeline])

  // ─── Add stage ──────────────────────────────────────────────────────────
  async function addStage() {
    if (!newLabel.trim()) return
    setAddingStage(true)
    setError(null)
    try {
      // Auto-generate a stage code from the label
      const stageCode = newLabel
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_')
        .replace(/[^A-Z0-9_]/g, '')

      const res = await fetch('/api/pipeline-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline: activePipeline,
          stageCode,
          label: newLabel.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to add stage')
        return
      }
      toast.success('Stage added')
      setNewLabel('')
      setShowAddForm(false)
      await fetchStages()
    } catch {
      setError('Failed to add stage')
    } finally {
      setAddingStage(false)
    }
  }

  // ─── Rename stage ───────────────────────────────────────────────────────
  async function saveRename(id: string) {
    if (!editLabel.trim()) return
    try {
      const res = await fetch(`/api/pipeline-stages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editLabel.trim() }),
      })
      if (!res.ok) throw new Error('Failed to rename')
      toast.success('Stage renamed')
      setEditingId(null)
      await fetchStages()
    } catch {
      toast.error('Failed to rename stage')
    }
  }

  // ─── Delete stage ───────────────────────────────────────────────────────
  async function deleteStage(id: string) {
    try {
      const res = await fetch(`/api/pipeline-stages/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to delete')
        return
      }
      toast.success('Stage deleted')
      await fetchStages()
    } catch {
      toast.error('Failed to delete stage')
    }
  }

  // ─── Reorder ────────────────────────────────────────────────────────────
  async function moveStage(id: string, direction: 'up' | 'down') {
    const idx = stages.findIndex((s) => s.id === id)
    if (idx < 0) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === stages.length - 1) return

    const newStages = [...stages]
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[newStages[idx], newStages[swapIdx]] = [newStages[swapIdx], newStages[idx]]

    // Optimistic update
    setStages(newStages)

    try {
      const res = await fetch('/api/pipeline-stages/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline: activePipeline,
          stageIds: newStages.map((s) => s.id),
        }),
      })
      if (!res.ok) throw new Error('Reorder failed')
      await fetchStages()
    } catch {
      toast.error('Failed to reorder stages')
      await fetchStages()
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading pipelines...
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">
      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Pipeline tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {PIPELINES.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              setActivePipeline(p.key)
              setShowAddForm(false)
              setEditingId(null)
            }}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activePipeline === p.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Stage list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-800">
              Stages
            </h3>
            <span className="text-xs text-gray-400">
              {stages.length} stage{stages.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm)
              setNewLabel('')
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Stage
          </button>
        </div>

        {/* Add stage form */}
        {showAddForm && (
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addStage()
                if (e.key === 'Escape') {
                  setShowAddForm(false)
                  setNewLabel('')
                }
              }}
              placeholder="New stage name..."
              autoFocus
              className="flex-1 border border-blue-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <button
              onClick={addStage}
              disabled={addingStage || !newLabel.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {addingStage ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Add
            </button>
            <button
              onClick={() => {
                setShowAddForm(false)
                setNewLabel('')
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {stages.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No stages configured for this pipeline.
          </div>
        ) : (
          <ul>
            {stages.map((stage, idx) => (
              <li
                key={stage.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0 group hover:bg-gray-50 transition-colors"
              >
                {/* Drag handle / order indicator */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveStage(stage.id, 'up')}
                    disabled={idx === 0}
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    title="Move up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveStage(stage.id, 'down')}
                    disabled={idx === stages.length - 1}
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    title="Move down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />

                {/* Order number */}
                <span className="w-6 text-center text-xs font-mono text-gray-400">
                  {idx + 1}
                </span>

                {/* Label (editable) */}
                <div className="flex-1 min-w-0">
                  {editingId === stage.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(stage.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        autoFocus
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => saveRename(stage.id)}
                        className="p-1 text-green-600 hover:text-green-700"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {stage.label}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {stage.stageCode}
                      </span>
                    </div>
                  )}
                </div>

                {/* System badge */}
                {stage.isSystem && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-semibold rounded-full flex-shrink-0">
                    <Lock className="w-2.5 h-2.5" />
                    System
                  </span>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {editingId !== stage.id && (
                    <button
                      onClick={() => {
                        setEditingId(stage.id)
                        setEditLabel(stage.label)
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                      title="Rename"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!stage.isSystem && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete stage "${stage.label}"? Any leads currently in this stage will keep their value but the stage will no longer appear in the pipeline.`)) {
                          deleteStage(stage.id)
                        }
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
        <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold">System stages cannot be deleted</p>
          <p className="mt-0.5 text-amber-700">
            Stages marked with the <strong>System</strong> badge have backend actions wired to them
            (e.g. Offer Made triggers the offer modal, Under Contract triggers routing logic).
            You can rename them but not delete them.
          </p>
        </div>
      </div>
    </div>
  )
}
