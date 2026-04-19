'use client'

import { useEffect, useState, useMemo } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'

interface TeamMember {
  roleId: string
  roleName: string
  userId: string
  userName: string
  userEmail: string
}

interface RoleOption {
  roleId: string
  roleName: string
}

interface PreviewResponse {
  currentCampaign: { id: string; name: string; type: string } | null
  newCampaign: { id: string; name: string; type: string }
  currentTeam: TeamMember[]
  newCampaignRoles: RoleOption[]
}

interface Props {
  propertyId: string
  /** The target campaign id, or an empty string meaning "clear the campaign". */
  newCampaignId: string
  /** Called with the accepted `roleMappings` so the caller can persist the change. */
  onConfirm: (payload: {
    newCampaignId: string | null
    roleMappings: Array<{ oldRoleId: string; newRoleId: string | null }>
  }) => Promise<void>
  onCancel: () => void
}

/**
 * Shown when an admin changes a lead's campaign in the PropertyEditPanel.
 *
 * For every role held on the current campaign (via PropertyTeamAssignment),
 * admin picks which role on the NEW campaign will inherit that user's tasks
 * and appointment attendance. Same-name roles auto-match by default.
 */
export function ChangeCampaignModal({ propertyId, newCampaignId, onConfirm, onCancel }: Props) {
  const [data, setData] = useState<PreviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  // Selection keyed by oldRoleId → newRoleId ('' = don't migrate)
  const [mapping, setMapping] = useState<Record<string, string>>({})

  // Clearing-to-no-campaign path: skip preview (no new campaign to map to).
  // We still render a confirmation so the admin can see the team will be
  // disbanded — the role-mapping grid just isn't shown.
  const isClearing = newCampaignId === ''

  useEffect(() => {
    if (isClearing) {
      // Still fetch current team so we can tell the admin WHO will be dropped.
      let cancelled = false
      setLoading(true)
      fetch(`/api/leads/${propertyId}/change-campaign-preview?newCampaignId=__none__`)
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}))
            throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load preview')
          }
          return r.json() as Promise<PreviewResponse>
        })
        .then((json) => {
          if (cancelled) return
          setData(json)
          setMapping({}) // nothing to map
        })
        .catch(() => {
          // Preview endpoint expects a valid new campaign — tolerate failure
          // by showing a generic warning without the team list.
          if (cancelled) return
          setData({
            currentCampaign: null,
            newCampaign: { id: '', name: 'No campaign', type: '' },
            currentTeam: [],
            newCampaignRoles: [],
          })
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }

    let cancelled = false
    setLoading(true)
    fetch(`/api/leads/${propertyId}/change-campaign-preview?newCampaignId=${encodeURIComponent(newCampaignId)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load preview')
        }
        return r.json() as Promise<PreviewResponse>
      })
      .then((json) => {
        if (cancelled) return
        setData(json)
        // Auto-match same-name roles; otherwise leave blank (= don't migrate).
        const seed: Record<string, string> = {}
        for (const oldMember of json.currentTeam) {
          const match = json.newCampaignRoles.find(
            (r) => r.roleName.toLowerCase() === oldMember.roleName.toLowerCase(),
          )
          seed[oldMember.roleId] = match?.roleId ?? ''
        }
        setMapping(seed)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load preview')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [propertyId, newCampaignId, isClearing])

  const hasTeam = !!data && data.currentTeam.length > 0

  const payload = useMemo(() => {
    if (!data) return null
    return {
      newCampaignId: isClearing ? null : newCampaignId,
      roleMappings: data.currentTeam.map((m) => ({
        oldRoleId: m.roleId,
        newRoleId: mapping[m.roleId] ? mapping[m.roleId] : null,
      })),
    }
  }, [data, mapping, newCampaignId, isClearing])

  async function handleConfirm() {
    if (!payload) return
    setSaving(true)
    setError('')
    try {
      await onConfirm(payload)
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
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 bg-blue-600">
          <h2 className="text-base font-semibold text-white">Change Campaign</h2>
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-white/80 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading campaign info…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : data ? (
            <>
              {/* Warning */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Before you proceed
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {isClearing ? (
                    <>
                      You are <strong>clearing the campaign</strong> from this lead
                      {data.currentCampaign?.name ? (
                        <> (currently <strong>{data.currentCampaign.name}</strong>)</>
                      ) : null}
                      . The team will be disbanded. Pending tasks will stay with their
                      current assignees unless you reassign them manually. Are you sure
                      you want to proceed?
                    </>
                  ) : (
                    <>
                      You are changing the campaign of this lead from{' '}
                      <strong>{data.currentCampaign?.name ?? '— none —'}</strong> to{' '}
                      <strong>{data.newCampaign.name}</strong>. The team on this lead will be
                      re-evaluated based on the <strong>{data.newCampaign.name}</strong> campaign&apos;s
                      roles. Are you sure you want to proceed?
                    </>
                  )}
                </p>
              </div>

              {/* Role mapping (skipped when clearing — nothing to map to) */}
              {!isClearing && hasTeam ? (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                    Tasks Migration
                  </p>
                  <p className="text-sm text-gray-600 mb-4">
                    How would you like the existing tasks and appointment attendance to be transferred over?
                  </p>

                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <p className="text-xs text-gray-500 mb-2">
                        Current roles in{' '}
                        <span className="font-medium text-gray-700">
                          {data.currentCampaign?.name ?? 'this lead'}
                        </span>
                      </p>
                      <div className="space-y-2">
                        {data.currentTeam.map((m) => (
                          <div
                            key={m.roleId}
                            className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg flex flex-col"
                          >
                            <span className="font-medium text-gray-800">{m.roleName}</span>
                            <span className="text-xs text-gray-500">{m.userName}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500 mb-2">
                        Reassign to role in{' '}
                        <span className="font-medium text-gray-700">{data.newCampaign.name}</span>
                      </p>
                      <div className="space-y-2">
                        {data.currentTeam.map((m) => (
                          <select
                            key={m.roleId}
                            value={mapping[m.roleId] ?? ''}
                            onChange={(e) =>
                              setMapping((prev) => ({ ...prev, [m.roleId]: e.target.value }))
                            }
                            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">— Don&apos;t migrate —</option>
                            {data.newCampaignRoles.map((r) => (
                              <option key={r.roleId} value={r.roleId}>
                                {r.roleName}
                              </option>
                            ))}
                          </select>
                        ))}
                      </div>
                    </div>
                  </div>

                  {data.newCampaignRoles.length === 0 && (
                    <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-800">
                        {data.newCampaign.name} has no roles enabled. Tasks will stay with their current
                        assignees; the team will be cleared.
                      </p>
                    </div>
                  )}
                </div>
              ) : isClearing && hasTeam ? (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    Team being removed
                  </p>
                  <div className="space-y-2">
                    {data.currentTeam.map((m) => (
                      <div
                        key={m.roleId}
                        className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between"
                      >
                        <span className="font-medium text-gray-800">{m.roleName}</span>
                        <span className="text-xs text-gray-500">{m.userName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 border-t border-gray-100 pt-4">
                  No team members are currently assigned to this lead. The campaign change will proceed without any migration.
                </p>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || loading || !!error || !data}
            className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
