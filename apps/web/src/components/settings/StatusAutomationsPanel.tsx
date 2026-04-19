'use client'

/**
 * StatusAutomationsPanel
 *
 * Configure per-stage automations for each pipeline:
 *   - Assign a drip campaign
 *   - Create a task when a lead enters a stage
 *   - Toggle active/inactive
 *
 * Calls:
 *   GET    /api/status-automations          — list all
 *   POST   /api/status-automations          — create / upsert
 *   PATCH  /api/status-automations/[id]     — update
 *   DELETE /api/status-automations/[id]     — delete
 *   GET    /api/campaigns                   — fetch campaign list for dropdown
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Save } from 'lucide-react'

// ─── Pipeline stage definitions ──────────────────────────────────────────────

const PIPELINES = [
  { key: 'leads', label: 'Leads' },
  { key: 'tm', label: 'Transaction Management' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'sold', label: 'Sold' },
  { key: 'rental', label: 'Rental' },
] as const

type PipelineKey = (typeof PIPELINES)[number]['key']

const STAGES: Record<PipelineKey, { code: string; label: string }[]> = {
  leads: [
    { code: 'NEW_LEADS', label: 'New Leads' },
    { code: 'DISCOVERY', label: 'Discovery' },
    { code: 'INTERESTED', label: 'Interested' },
    { code: 'APPOINTMENT_MADE', label: 'Appointment Made' },
    { code: 'DUE_DILIGENCE', label: 'Due Diligence' },
    { code: 'OFFERS_MADE', label: 'Offers Made' },
    { code: 'OFFER_FOLLOW_UP', label: 'Offer Follow-Up' },
    { code: 'UNDER_CONTRACT', label: 'Under Contract' },
  ],
  tm: [
    { code: 'NEW_CONTRACT', label: 'New Contract' },
    { code: 'MARKETING_TO_BUYERS', label: 'Marketing to Buyers' },
    { code: 'SHOWING_TO_BUYERS', label: 'Showing to Buyers' },
    { code: 'EVALUATING_OFFERS', label: 'Evaluating Offers' },
    { code: 'ACCEPTED_OFFER', label: 'Accepted Offer' },
    { code: 'CLEAR_TO_CLOSE', label: 'Clear to Close' },
  ],
  inventory: [
    { code: 'NEW_INVENTORY', label: 'New Inventory' },
    { code: 'GETTING_ESTIMATES', label: 'Getting Estimates' },
    { code: 'UNDER_REHAB', label: 'Under Rehab' },
    { code: 'LISTED_FOR_SALE', label: 'Listed for Sale' },
    { code: 'UNDER_CONTRACT', label: 'Under Contract' },
  ],
  sold: [{ code: 'CLOSED', label: 'Closed' }],
  rental: [{ code: 'ACTIVE_RENTAL', label: 'Active Rental' }],
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface StatusAutomation {
  id: string
  workspaceType: string
  stageCode: string
  dripCampaignId: string | null
  taskTemplateId: string | null
  taskTitle: string | null
  taskAssigneeId: string | null
  isActive: boolean
}

interface Campaign {
  id: string
  name: string
}

interface RowState {
  dripCampaignId: string
  taskTitle: string
  isActive: boolean
  saving: boolean
  dirty: boolean
  existingId: string | null
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StatusAutomationsPanel() {
  const [activePipeline, setActivePipeline] = useState<PipelineKey>('leads')
  const [automations, setAutomations] = useState<StatusAutomation[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Row-level editing state keyed by "workspaceType:stageCode"
  const [rows, setRows] = useState<Record<string, RowState>>({})

  // ─── Fetch data ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const [autoRes, campRes] = await Promise.all([
        fetch('/api/status-automations'),
        fetch('/api/campaigns'),
      ])
      if (!autoRes.ok) throw new Error('Failed to load status automations')

      const autoData: StatusAutomation[] = await autoRes.json()
      setAutomations(autoData)

      if (campRes.ok) {
        const campData = await campRes.json()
        // campaigns API returns { data: [...] } or just an array
        const list = Array.isArray(campData) ? campData : (campData.data ?? [])
        setCampaigns(list)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Build row state from automations whenever automations or pipeline change
  useEffect(() => {
    const newRows: Record<string, RowState> = {}
    const stages = STAGES[activePipeline]

    for (const stage of stages) {
      const key = `${activePipeline}:${stage.code}`
      const existing = automations.find(
        (a) => a.workspaceType === activePipeline && a.stageCode === stage.code,
      )
      newRows[key] = {
        dripCampaignId: existing?.dripCampaignId ?? '',
        taskTitle: existing?.taskTitle ?? '',
        isActive: existing?.isActive ?? true,
        saving: false,
        dirty: false,
        existingId: existing?.id ?? null,
      }
    }
    setRows(newRows)
  }, [automations, activePipeline])

  // ─── Row change handlers ───────────────────────────────────────────────────

  function updateRow(key: string, patch: Partial<RowState>) {
    setRows((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch, dirty: true },
    }))
  }

  // ─── Save per row ──────────────────────────────────────────────────────────

  async function saveRow(stageCode: string) {
    const key = `${activePipeline}:${stageCode}`
    const row = rows[key]
    if (!row) return

    setRows((prev) => ({ ...prev, [key]: { ...prev[key], saving: true } }))
    setError(null)

    try {
      if (row.existingId) {
        // Update existing
        const res = await fetch(`/api/status-automations/${row.existingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dripCampaignId: row.dripCampaignId || null,
            taskTitle: row.taskTitle || null,
            isActive: row.isActive,
          }),
        })
        if (!res.ok) throw new Error('Failed to save')
      } else {
        // Create new (upsert)
        const res = await fetch('/api/status-automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceType: activePipeline,
            stageCode,
            dripCampaignId: row.dripCampaignId || null,
            taskTitle: row.taskTitle || null,
            isActive: row.isActive,
          }),
        })
        if (!res.ok) throw new Error('Failed to save')
      }

      // Refetch to get updated IDs
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving')
    } finally {
      setRows((prev) => ({
        ...prev,
        [key]: { ...prev[key], saving: false, dirty: false },
      }))
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading status automations...
      </div>
    )
  }

  const stages = STAGES[activePipeline]

  return (
    <div className="max-w-4xl space-y-4">
      {/* Header */}
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Status Automations</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Configure drip campaigns and task creation for each pipeline stage.
        </p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Pipeline tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {PIPELINES.map((p) => (
          <button
            key={p.key}
            onClick={() => setActivePipeline(p.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activePipeline === p.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Stage table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stage
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Drip Campaign
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Task Assignment
              </th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Active
              </th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => {
              const key = `${activePipeline}:${stage.code}`
              const row = rows[key]
              if (!row) return null

              return (
                <tr key={stage.code} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{stage.label}</td>

                  {/* Drip campaign dropdown */}
                  <td className="px-4 py-3">
                    <select
                      value={row.dripCampaignId}
                      onChange={(e) =>
                        updateRow(key, { dripCampaignId: e.target.value })
                      }
                      className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    >
                      <option value="">None</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Task title */}
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={row.taskTitle}
                      onChange={(e) =>
                        updateRow(key, { taskTitle: e.target.value })
                      }
                      placeholder="None"
                      className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>

                  {/* Active toggle */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => updateRow(key, { isActive: !row.isActive })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        row.isActive ? 'bg-blue-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                          row.isActive ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>

                  {/* Save */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => saveRow(stage.code)}
                      disabled={row.saving || !row.dirty}
                      className="inline-flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                    >
                      {row.saving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                      Save
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
