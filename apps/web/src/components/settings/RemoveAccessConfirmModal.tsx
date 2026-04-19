'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'

interface EligibleUser {
  id: string
  name: string
  email: string
}

interface ImpactBucket {
  roleId: string
  roleName: string
  campaignId: string
  campaignName: string
  primaryLeadCount: number
  teamSlotCount: number
  openTaskCount: number
  totalAffected: number
  eligibleReplacements: EligibleUser[]
}

interface ImpactResponse {
  userId: string
  userName: string
  hasAnyImpact: boolean
  buckets: ImpactBucket[]
}

export interface ReassignmentChoice {
  roleId: string
  campaignId: string
  reassignToUserId: string | null
}

interface Props {
  userId: string
  userName: string
  removedPairs: Array<{ roleId: string; campaignId: string }>
  onCancel: () => void
  onConfirm: (choices: ReassignmentChoice[]) => Promise<void>
}

/**
 * Shown when an admin clicks Save in the "Remove User Access" window and
 * the access being removed has downstream impact (leads as primary,
 * PropertyTeamAssignment rows, pending tasks).
 *
 * Per (role, campaign) bucket the admin picks either a replacement user or
 * "leave unassigned". On confirm the caller posts both the remove AND the
 * reassignments in a single transaction so nothing orphans.
 */
export function RemoveAccessConfirmModal({
  userId,
  userName,
  removedPairs,
  onCancel,
  onConfirm,
}: Props) {
  const [data, setData] = useState<ImpactResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  // Selection keyed by `${roleId}:${campaignId}` — null = leave unassigned
  const [selections, setSelections] = useState<Record<string, string | null>>({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/users/${userId}/access-revocation-impact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removedPairs }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load impact')
        }
        return r.json() as Promise<ImpactResponse>
      })
      .then((json) => {
        if (cancelled) return
        setData(json)
        // Default: leave everything unassigned
        const seed: Record<string, string | null> = {}
        for (const b of json.buckets) seed[`${b.roleId}:${b.campaignId}`] = null
        setSelections(seed)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load impact')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, removedPairs])

  async function handleConfirm() {
    if (!data) return
    setSaving(true)
    setError('')
    try {
      const choices: ReassignmentChoice[] = data.buckets.map((b) => ({
        roleId: b.roleId,
        campaignId: b.campaignId,
        reassignToUserId: selections[`${b.roleId}:${b.campaignId}`] ?? null,
      }))
      await onConfirm(choices)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={saving ? undefined : onCancel} />
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 bg-red-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Reassign before removing access
              </h2>
              <p className="text-xs text-gray-600 mt-0.5">
                {userName} currently holds leads, team slots, or open tasks on the access you&apos;re removing.
                Pick a replacement per campaign, or leave as unassigned.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading impact…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !data || data.buckets.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">
              Nothing to reassign. You can safely remove this access.
            </p>
          ) : (
            <div className="space-y-3">
              {data.buckets.map((b) => {
                const key = `${b.roleId}:${b.campaignId}`
                const hasImpact = b.totalAffected > 0
                return (
                  <div
                    key={key}
                    className={`border rounded-lg p-4 ${hasImpact ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {b.roleName} &middot; {b.campaignName}
                        </p>
                        {hasImpact ? (
                          <p className="text-xs text-amber-800 mt-0.5">
                            {b.primaryLeadCount > 0 && <>{b.primaryLeadCount} primary lead{b.primaryLeadCount === 1 ? '' : 's'}</>}
                            {b.primaryLeadCount > 0 && (b.teamSlotCount > 0 || b.openTaskCount > 0) && ' · '}
                            {b.teamSlotCount > 0 && <>{b.teamSlotCount} team slot{b.teamSlotCount === 1 ? '' : 's'}</>}
                            {b.teamSlotCount > 0 && b.openTaskCount > 0 && ' · '}
                            {b.openTaskCount > 0 && <>{b.openTaskCount} open task{b.openTaskCount === 1 ? '' : 's'}</>}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500 mt-0.5">No leads or tasks to reassign.</p>
                        )}
                      </div>
                    </div>
                    {hasImpact && (
                      <div>
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">Reassign to</label>
                        <select
                          value={selections[key] ?? ''}
                          onChange={(e) =>
                            setSelections((prev) => ({
                              ...prev,
                              [key]: e.target.value === '' ? null : e.target.value,
                            }))
                          }
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">— Leave unassigned —</option>
                          {b.eligibleReplacements.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.email})
                            </option>
                          ))}
                        </select>
                        {b.eligibleReplacements.length === 0 && (
                          <p className="text-[11px] text-gray-500 mt-1">
                            No other user currently holds this role on this campaign.
                            Add someone first if you want to hand the work over.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || loading || !!error}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Remove Access
          </button>
        </div>
      </div>
    </div>
  )
}
