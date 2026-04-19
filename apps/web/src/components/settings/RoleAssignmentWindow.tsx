'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react'
import type { RoleItem } from './UsersList'

export interface CampaignAssignment {
  campaignId: string
  assignNewLeads: boolean
  backfillExistingLeads: boolean
}

export interface RoleConfig {
  roleId: string
  leadAccessEnabled: boolean
  campaigns: CampaignAssignment[]
}

interface LeadCampaignOption {
  id: string
  name: string
  type: string
}

interface Props {
  fullName: string
  roles: RoleItem[]
  leadCampaigns: LeadCampaignOption[]
  initialConfigs: RoleConfig[]
  mode: 'create' | 'append' | 'remove'
  onClose: () => void
  onSave: (configs: RoleConfig[]) => Promise<void> | void
}

export function RoleAssignmentWindow({
  fullName,
  roles,
  leadCampaigns,
  initialConfigs,
  mode,
  onClose,
  onSave,
}: Props) {
  const prettyUser = fullName.trim() || 'this user'

  // Hydrated working copy of the configs (what the wizard mutates)
  const [configs, setConfigs] = useState<RoleConfig[]>(() =>
    initialConfigs.map((c) => ({
      ...c,
      campaigns: c.campaigns.map((cc) => ({ ...cc })),
    })),
  )

  // Snapshot of initialConfigs for diffing in append/remove modes
  const initialSnapshot = useMemo(
    () =>
      new Map(
        initialConfigs.map((c) => [
          c.roleId,
          {
            leadAccessEnabled: c.leadAccessEnabled,
            campaigns: new Set(c.campaigns.map((cc) => cc.campaignId)),
          },
        ]),
      ),
    [initialConfigs],
  )

  // In 'remove' mode, limit the visible catalog to roles/campaigns that are
  // currently assigned. In create/append we show the full catalog.
  const visibleRoles = useMemo(() => {
    if (mode !== 'remove') return roles
    const assignedIds = new Set(initialConfigs.map((c) => c.roleId))
    return roles.filter((r) => assignedIds.has(r.id))
  }, [mode, roles, initialConfigs])

  function visibleCampaigns(roleId: string): LeadCampaignOption[] {
    if (mode !== 'remove') return leadCampaigns
    const snap = initialSnapshot.get(roleId)
    if (!snap) return []
    return leadCampaigns.filter((lc) => snap.campaigns.has(lc.id))
  }

  // Helper: detect whether a role/campaign was pre-existing (for "Current" badges in append mode)
  function isPreExistingRole(roleId: string): boolean {
    return initialSnapshot.has(roleId)
  }

  function isPreExistingCampaign(roleId: string, campaignId: string): boolean {
    return initialSnapshot.get(roleId)?.campaigns.has(campaignId) ?? false
  }

  // Active role = currently focused in the UI. Default: first selected or first visible role.
  const [activeRoleId, setActiveRoleId] = useState<string | null>(() => {
    if (configs.length > 0) return configs[0].roleId
    return visibleRoles[0]?.id ?? null
  })

  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const activeRole = roles.find((r) => r.id === activeRoleId) ?? null
  const activeConfig = configs.find((c) => c.roleId === activeRoleId) ?? null
  const activeCampaign = leadCampaigns.find((lc) => lc.id === activeCampaignId) ?? null

  function isRoleSelected(roleId: string): boolean {
    return configs.some((c) => c.roleId === roleId)
  }

  function toggleRole(roleId: string) {
    // In append mode, pre-existing roles are locked ON — cannot toggle off
    if (mode === 'append' && isPreExistingRole(roleId) && isRoleSelected(roleId)) return

    if (isRoleSelected(roleId)) {
      setConfigs((prev) => prev.filter((c) => c.roleId !== roleId))
      if (activeRoleId === roleId) {
        const remaining = configs.filter((c) => c.roleId !== roleId)
        setActiveRoleId(remaining[0]?.roleId ?? null)
        setActiveCampaignId(null)
      }
    } else {
      // In remove mode, new checks are not allowed
      if (mode === 'remove') return
      setConfigs((prev) => [
        ...prev,
        { roleId, leadAccessEnabled: false, campaigns: [] },
      ])
      setActiveRoleId(roleId)
      setActiveCampaignId(null)
    }
  }

  function setLeadAccess(roleId: string, enabled: boolean) {
    setConfigs((prev) =>
      prev.map((c) =>
        c.roleId === roleId
          ? {
              ...c,
              leadAccessEnabled: enabled,
              campaigns: enabled ? c.campaigns : [],
            }
          : c,
      ),
    )
    if (!enabled) setActiveCampaignId(null)
  }

  function toggleCampaign(roleId: string, campaignId: string) {
    // In append mode, pre-existing campaigns under a pre-existing role are locked ON
    const preExisting =
      mode === 'append' && isPreExistingCampaign(roleId, campaignId)
    if (preExisting) {
      // Still allow focusing so the user can view the saved config
      setActiveCampaignId(campaignId)
      return
    }
    // In remove mode, new checks are not allowed
    if (mode === 'remove' && !isPreExistingCampaign(roleId, campaignId)) return

    setConfigs((prev) =>
      prev.map((c) => {
        if (c.roleId !== roleId) return c
        const exists = c.campaigns.some((cc) => cc.campaignId === campaignId)
        if (exists) {
          return {
            ...c,
            campaigns: c.campaigns.filter((cc) => cc.campaignId !== campaignId),
          }
        }
        return {
          ...c,
          campaigns: [
            ...c.campaigns,
            {
              campaignId,
              assignNewLeads: false,
              backfillExistingLeads: false,
            },
          ],
        }
      }),
    )

    // When checking, focus it. When unchecking the focused one, clear focus.
    const existsAfter = !configs
      .find((c) => c.roleId === roleId)
      ?.campaigns.some((cc) => cc.campaignId === campaignId)
    setActiveCampaignId(existsAfter ? campaignId : null)
  }

  function updateCampaign(
    roleId: string,
    campaignId: string,
    patch: Partial<CampaignAssignment>,
  ) {
    setConfigs((prev) =>
      prev.map((c) =>
        c.roleId !== roleId
          ? c
          : {
              ...c,
              campaigns: c.campaigns.map((cc) =>
                cc.campaignId === campaignId ? { ...cc, ...patch } : cc,
              ),
            },
      ),
    )
  }

  const activeRoleName = activeRole?.name ?? ''

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await onSave(configs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save role assignments')
    } finally {
      setSaving(false)
    }
  }

  const breadcrumbTail =
    mode === 'create'
      ? `Add User > ${prettyUser}`
      : mode === 'append'
        ? `Edit User > ${prettyUser} > Append Access`
        : `Edit User > ${prettyUser} > Remove Access`

  // Whether a campaign checkbox should visually appear locked / read-only
  function isCampaignLocked(roleId: string, campaignId: string): boolean {
    if (mode === 'append' && isPreExistingCampaign(roleId, campaignId)) return true
    if (mode === 'remove' && !isPreExistingCampaign(roleId, campaignId)) return true
    return false
  }

  function isCampaignChecked(roleId: string, campaignId: string): boolean {
    return !!configs
      .find((c) => c.roleId === roleId)
      ?.campaigns.some((cc) => cc.campaignId === campaignId)
  }

  const activeCampaignAssignment = activeConfig?.campaigns.find(
    (cc) => cc.campaignId === activeCampaignId,
  )

  return (
    <div>
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button
          onClick={onClose}
          className="hover:text-blue-600 transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to user details
        </button>
        <span>{'>'}</span>
        <span>Manage User</span>
        <span>{'>'}</span>
        <span className="text-gray-800 font-medium">{breadcrumbTail}</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-blue-600">
          <h2 className="text-lg font-semibold text-white">
            {mode === 'create' && 'Configure Role & Campaign Access'}
            {mode === 'append' && 'Append Role & Campaign Access'}
            {mode === 'remove' && 'Remove Role & Campaign Access'}
          </h2>
          <p className="text-sm text-blue-100">
            {mode === 'create' && `Set up which roles and campaigns ${prettyUser} will work in.`}
            {mode === 'append' && `Add new roles or campaigns for ${prettyUser}.`}
            {mode === 'remove' && `Remove currently-assigned roles or campaigns for ${prettyUser}.`}
          </p>
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-10 min-h-[480px]">
          {/* LEFT 30%: role list */}
          <div className="col-span-3 border-r border-gray-200 bg-gray-50 p-4 overflow-y-auto max-h-[640px]">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Roles
            </p>
            {visibleRoles.length === 0 && (
              <p className="text-xs text-gray-400 italic">
                {mode === 'remove'
                  ? 'No roles currently assigned.'
                  : 'No roles available.'}
              </p>
            )}
            <div className="space-y-2">
              {visibleRoles.map((role) => {
                const selected = isRoleSelected(role.id)
                const isActive = activeRoleId === role.id
                const preExisting = isPreExistingRole(role.id)
                const locked = mode === 'append' && preExisting && selected
                return (
                  <div
                    key={role.id}
                    className={`border rounded-xl transition-colors cursor-pointer ${
                      selected
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    } ${isActive ? 'ring-2 ring-blue-400' : ''}`}
                    onClick={() => {
                      setActiveRoleId(role.id)
                      setActiveCampaignId(null)
                    }}
                  >
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <label
                        className={`flex items-center gap-2 ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={locked}
                          onChange={() => toggleRole(role.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
                        />
                        <span className="text-sm font-medium text-gray-800">
                          {role.name}
                        </span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        {mode === 'append' && preExisting && (
                          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                            Current
                          </span>
                        )}
                        {selected && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-100 border border-blue-200 rounded px-1.5 py-0.5">
                            <CheckCircle2 className="w-3 h-3" />
                            Selected
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                    {mode === 'append' && preExisting && (
                      <p className="px-3 pb-2 text-[10px] text-gray-400">
                        Already assigned
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* RIGHT 70%: cascading panels */}
          <div className="col-span-7 p-0 grid grid-cols-2 min-h-[480px]">
            {/* Right-Left: Lead Access gate + campaign list */}
            <div className="border-r border-gray-200 p-5 overflow-y-auto max-h-[640px]">
              {!activeRole || !activeConfig ? (
                <p className="text-sm text-gray-400 italic">
                  {mode === 'remove'
                    ? 'Select a role to remove.'
                    : 'Select a role on the left to configure access.'}
                </p>
              ) : (
                <div className="space-y-5">
                  {/* Lead Access */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Lead Access
                    </p>
                    <p className="text-sm text-gray-700 mb-3">
                      Would you like <strong>{prettyUser}</strong> to be part of{' '}
                      <strong>Teams</strong> tab in Leads in the role of{' '}
                      <strong>{activeRoleName}</strong>?
                    </p>
                    <YesNoRadios
                      value={activeConfig.leadAccessEnabled}
                      onChange={(v) => setLeadAccess(activeRole.id, v)}
                    />
                  </div>

                  {/* Campaigns (if Lead Access = Yes) */}
                  {activeConfig.leadAccessEnabled && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Campaigns
                      </p>
                      <p className="text-sm text-gray-700 mb-3">
                        Which campaign(s) would you like{' '}
                        <strong>{prettyUser}</strong> to have access to as{' '}
                        <strong>{activeRoleName}</strong>?
                      </p>
                      {(() => {
                        const options = visibleCampaigns(activeRole.id)
                        if (options.length === 0) {
                          return (
                            <p className="text-xs text-gray-400 italic">
                              {mode === 'remove'
                                ? 'No campaigns currently assigned for this role.'
                                : 'No campaigns available.'}
                            </p>
                          )
                        }
                        return (
                          <div className="space-y-2">
                            {options.map((lc) => {
                              const checked = isCampaignChecked(activeRole.id, lc.id)
                              const isActiveCamp = activeCampaignId === lc.id
                              const locked = isCampaignLocked(activeRole.id, lc.id)
                              const preExisting = isPreExistingCampaign(
                                activeRole.id,
                                lc.id,
                              )
                              return (
                                <div
                                  key={lc.id}
                                  className={`border rounded-xl cursor-pointer transition-colors ${
                                    checked
                                      ? 'bg-blue-50 border-blue-200'
                                      : 'bg-white border-gray-200 hover:border-gray-300'
                                  } ${isActiveCamp ? 'ring-2 ring-blue-400' : ''}`}
                                  onClick={() => setActiveCampaignId(lc.id)}
                                >
                                  <div className="flex items-center justify-between px-3 py-2.5">
                                    <label
                                      className={`flex items-center gap-2 ${locked && mode === 'append' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={locked && mode === 'append'}
                                        onChange={() =>
                                          toggleCampaign(activeRole.id, lc.id)
                                        }
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
                                      />
                                      <div>
                                        <p className="text-sm font-medium text-gray-800">
                                          {lc.name}
                                        </p>
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                                          {lc.type}
                                        </p>
                                      </div>
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                      {mode === 'append' && preExisting && (
                                        <span className="text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                                          Current
                                        </span>
                                      )}
                                      {checked && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-100 border border-blue-200 rounded px-1.5 py-0.5">
                                          <CheckCircle2 className="w-3 h-3" />
                                          Selected
                                        </span>
                                      )}
                                      <ChevronRight className="w-4 h-4 text-gray-400" />
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right-Right: focused campaign toggles */}
            <div className="p-5 overflow-y-auto max-h-[640px] bg-gray-50/40">
              {!activeCampaign ||
              !activeConfig ||
              !activeConfig.leadAccessEnabled ||
              !activeCampaignAssignment ? (
                <p className="text-sm text-gray-400 italic">
                  {activeConfig?.leadAccessEnabled
                    ? 'Select a campaign to configure existing & new lead routing.'
                    : 'Enable Lead Access and pick a campaign to configure routing.'}
                </p>
              ) : (
                <div className="space-y-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {activeCampaign.name}
                  </p>

                  {/* Existing Leads */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Existing Leads
                    </p>
                    <p className="text-sm text-gray-700 mb-3">
                      Would you like to make <strong>{prettyUser}</strong> the{' '}
                      <strong>{activeRoleName}</strong> for existing unassigned leads
                      in <strong>{activeCampaign.name}</strong> campaign?{' '}
                      <a
                        href="#"
                        onClick={(e) => e.preventDefault()}
                        className="text-blue-600 hover:text-blue-700 text-xs"
                      >
                        Learn more.
                      </a>
                    </p>
                    <YesNoRadios
                      value={activeCampaignAssignment.backfillExistingLeads}
                      onChange={(v) =>
                        updateCampaign(activeRole!.id, activeCampaign.id, {
                          backfillExistingLeads: v,
                        })
                      }
                    />
                  </div>

                  {/* New Leads */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      New Leads
                    </p>
                    <p className="text-sm text-gray-700 mb-3">
                      Would you like to assign new leads in{' '}
                      <strong>{activeCampaign.name}</strong> campaign to{' '}
                      <strong>{prettyUser}</strong>?{' '}
                      <a
                        href="#"
                        onClick={(e) => e.preventDefault()}
                        className="text-blue-600 hover:text-blue-700 text-xs"
                      >
                        Learn more.
                      </a>
                    </p>
                    <YesNoRadios
                      value={activeCampaignAssignment.assignNewLeads}
                      onChange={(v) =>
                        updateCampaign(activeRole!.id, activeCampaign.id, {
                          assignNewLeads: v,
                        })
                      }
                    />
                  </div>

                  <p className="text-[10px] text-gray-400">
                    If more than one user is assigned to the same role + campaign,
                    new leads are distributed round-robin. Vacation mode pauses
                    auto-assignment.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      {/* Footer */}
      <div className="flex justify-between items-center mt-4">
        <button
          onClick={onClose}
          className="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors active:scale-95 flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === 'remove' ? 'Remove Access' : 'Save'}
        </button>
      </div>
    </div>
  )
}

/* ─── Sub-components ─── */

function YesNoRadios({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          value
            ? 'bg-blue-600 text-white border-blue-600'
            : 'border-gray-200 text-gray-600 hover:bg-gray-100'
        }`}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          !value
            ? 'bg-gray-200 text-gray-800 border-gray-200'
            : 'border-gray-200 text-gray-600 hover:bg-gray-100'
        }`}
      >
        No
      </button>
    </div>
  )
}
