'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronRight, CheckCircle, ArrowLeft, Loader2, Plane, Trash2, Plus, Minus } from 'lucide-react'
import { BasicDetailsModal } from './BasicDetailsModal'
import { RoleAssignmentPanel } from './RoleAssignmentPanel'
import { RoleAssignmentWindow, type RoleConfig } from './RoleAssignmentWindow'
import { RemoveAccessConfirmModal, type ReassignmentChoice } from './RemoveAccessConfirmModal'
import { VacationModeModal } from './VacationModeModal'
import { DeleteUserReassignmentModal } from './DeleteUserReassignmentModal'
import { LeadPermissionsModal } from './LeadPermissionsModal'
import type { UserRow, RoleItem, CampaignItem } from './UsersList'

interface Props {
  user: UserRow
  roles: RoleItem[]
  campaigns: CampaignItem[]
  /**
   * Preloaded LeadCampaign list from the settings page. When provided, the
   * panel skips its own /api/lead-campaigns fetch — eliminates a round-trip
   * and the visible "No role selected" flicker on mount.
   */
  leadCampaigns?: Array<{ id: string; name: string; type: string }>
  onBack: () => void
}

type Permission = string

// Note: `leads.*` permissions are intentionally NOT here — they live in the
// dedicated Lead Permissions section above, which also handles per-stage and
// per-action scopes. Listing them in both places led to confusing duplication.
const MODULE_GROUPS: { label: string; perms: Permission[] }[] = [
  { label: 'Transaction Mgmt', perms: ['tm.view', 'tm.edit'] },
  { label: 'Inventory', perms: ['inventory.view', 'inventory.edit'] },
  { label: 'Dispo', perms: ['dispo.view', 'dispo.edit'] },
  { label: 'Contacts', perms: ['contacts.view', 'contacts.edit'] },
  { label: 'Communications', perms: ['comms.view', 'comms.send'] },
  { label: 'Tasks', perms: ['tasks.view', 'tasks.manage'] },
  { label: 'Campaigns', perms: ['campaigns.view', 'campaigns.manage'] },
  { label: 'Analytics', perms: ['analytics.view'] },
  { label: 'Settings', perms: ['settings.view', 'settings.manage'] },
  { label: 'Users', perms: ['users.view', 'users.manage'] },
  { label: 'Admin', perms: ['admin.all'] },
]

export function EditUserPanel({ user: initialUser, roles, campaigns, leadCampaigns: leadCampaignsProp, onBack }: Props) {
  const router = useRouter()
  const [user, setUser] = useState(initialUser)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const [showBasicDetails, setShowBasicDetails] = useState(false)
  const [showRoleAssignment, setShowRoleAssignment] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showVacation, setShowVacation] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showLeadPerms, setShowLeadPerms] = useState(false)

  // Role Assignment Window state
  const [showRoleWindow, setShowRoleWindow] = useState<null | 'create' | 'append' | 'remove'>(null)
  const [roleConfigs, setRoleConfigs] = useState<RoleConfig[]>([])
  const [roleConfigsLoading, setRoleConfigsLoading] = useState(true)
  const [leadCampaigns, setLeadCampaigns] = useState<{ id: string; name: string; type: string }[]>(
    leadCampaignsProp ?? [],
  )

  // Track which sections have been "completed" (interacted with)
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set())

  // Fetch role configs for the RoleAssignmentWindow. Tracks loading state so
  // the Role Assignment section shows "Loading..." instead of the misleading
  // "No role selected" while the request is in flight.
  useEffect(() => {
    setRoleConfigsLoading(true)
    fetch(`/api/users/${user.id}/role-configs`)
      .then((r) => r.json())
      .then((json) => {
        const list = Array.isArray(json) ? json : (json.data ?? json.configs ?? [])
        const parsed: RoleConfig[] = (list || []).map((c: any) => ({
          roleId: c.roleId,
          leadAccessEnabled: !!c.leadAccessEnabled,
          campaigns: (c.campaigns ?? []).map((cc: any) => ({
            campaignId: cc.campaignId,
            assignNewLeads: !!cc.assignNewLeads,
            backfillExistingLeads: !!cc.backfillExistingLeads,
          })),
        }))
        setRoleConfigs(parsed)
      })
      .catch(() => {})
      .finally(() => setRoleConfigsLoading(false))
  }, [user.id])

  // Only fetch lead-campaigns when the SSR-preloaded prop wasn't supplied.
  useEffect(() => {
    if (leadCampaignsProp) return
    fetch('/api/lead-campaigns')
      .then((r) => r.json())
      .then((json) => {
        const list = Array.isArray(json) ? json : (json.data ?? [])
        setLeadCampaigns(
          list.map((lc: any) => ({
            id: lc.id,
            name: lc.name,
            type: lc.type ?? '',
          })),
        )
      })
      .catch(() => {})
  }, [leadCampaignsProp])

  async function refetchRoleConfigs() {
    try {
      const res = await fetch(`/api/users/${user.id}/role-configs`)
      const json = await res.json()
      const list = Array.isArray(json) ? json : (json.data ?? json.configs ?? [])
      const parsed: RoleConfig[] = (list || []).map((c: any) => ({
        roleId: c.roleId,
        leadAccessEnabled: !!c.leadAccessEnabled,
        campaigns: (c.campaigns ?? []).map((cc: any) => ({
          campaignId: cc.campaignId,
          assignNewLeads: !!cc.assignNewLeads,
          backfillExistingLeads: !!cc.backfillExistingLeads,
        })),
      }))
      setRoleConfigs(parsed)
    } catch {
      // swallow — this is a refetch after a successful save
    }
  }

  // Pending remove flow — populated when the RoleAssignmentWindow saves in
  // 'remove' mode. We hold the in-flight configs here while the
  // RemoveAccessConfirmModal asks the admin how to reassign affected items.
  const [pendingRemove, setPendingRemove] = useState<{
    configs: RoleConfig[]
    removedPairs: Array<{ roleId: string; campaignId: string }>
  } | null>(null)

  async function postRoleConfigs(configs: RoleConfig[], reassignments?: ReassignmentChoice[]) {
    const res = await fetch(`/api/users/${user.id}/role-configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configs, ...(reassignments ? { reassignments } : {}) }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error ?? 'Failed to save role configurations')
    }
  }

  async function handleSaveRoleConfigs(configs: RoleConfig[]) {
    try {
      // If this is a REMOVE save, intercept: compute what's being removed and
      // show the reassignment modal BEFORE committing. For create/append,
      // nothing is removed — go straight through.
      if (showRoleWindow === 'remove') {
        const beforePairs = new Set(
          roleConfigs.flatMap((c) => c.campaigns.map((cc) => `${c.roleId}:${cc.campaignId}`)),
        )
        const afterPairs = new Set(
          configs.flatMap((c) => c.campaigns.map((cc) => `${c.roleId}:${cc.campaignId}`)),
        )
        const removedPairs = Array.from(beforePairs)
          .filter((k) => !afterPairs.has(k))
          .map((k) => {
            const [roleId, campaignId] = k.split(':')
            return { roleId, campaignId }
          })

        if (removedPairs.length > 0) {
          // Show the confirm modal — it will call onConfirm(choices) when the
          // admin commits, which then triggers the actual POST.
          setPendingRemove({ configs, removedPairs })
          return
        }
      }

      // Non-remove path OR remove with no actual pairs dropped — save directly.
      await postRoleConfigs(configs)
      await refetchRoleConfigs()
      setShowRoleWindow(null)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save role configurations')
      throw err
    }
  }

  async function handleConfirmRemoveReassignments(choices: ReassignmentChoice[]) {
    if (!pendingRemove) return
    try {
      await postRoleConfigs(pendingRemove.configs, choices)
      await refetchRoleConfigs()
      setPendingRemove(null)
      setShowRoleWindow(null)
      router.refresh()
      toast.success('Access removed and reassignments applied')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove access')
      throw err
    }
  }

  function toggleSection(section: string) {
    setExpandedSection(expandedSection === section ? null : section)
  }

  function markCompleted(section: string) {
    setCompletedSections((prev) => new Set([...prev, section]))
  }

  async function handleSaveUser() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: user.name,
          email: user.email,
          phone: user.phone,
          roleId: user.role.id,
          marketIds: user.marketIds,
          permissions: user.permissions ?? [],
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to save user')
      }

      router.refresh()
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save user')
    } finally {
      setSaving(false)
    }
  }

  function togglePermission(perm: string) {
    setUser((prev) => {
      const current = new Set(prev.permissions ?? [])
      if (current.has(perm)) current.delete(perm)
      else current.add(perm)
      markCompleted('permissions')
      return { ...prev, permissions: [...current] }
    })
  }

  if (showRoleAssignment) {
    return (
      <RoleAssignmentPanel
        user={user}
        roles={roles}
        campaigns={campaigns}
        onBack={() => {
          setShowRoleAssignment(false)
          markCompleted('role')
        }}
        onUpdate={(updated) => {
          setUser(updated)
          setShowRoleAssignment(false)
          markCompleted('role')
        }}
      />
    )
  }

  if (showRoleWindow) {
    return (
      <>
        <RoleAssignmentWindow
          fullName={user.name}
          roles={roles}
          leadCampaigns={leadCampaigns}
          initialConfigs={roleConfigs}
          mode={showRoleWindow}
          onClose={() => setShowRoleWindow(null)}
          onSave={handleSaveRoleConfigs}
        />
        {pendingRemove && (
          <RemoveAccessConfirmModal
            userId={user.id}
            userName={user.name}
            removedPairs={pendingRemove.removedPairs}
            onCancel={() => setPendingRemove(null)}
            onConfirm={handleConfirmRemoveReassignments}
          />
        )}
      </>
    )
  }

  // Permissions are per-user (decoupled from role). User.permissions[] is the
  // sole source of truth — no fallback to role.permissions, which would mask
  // admin intent to leave a user with no permissions.
  const userPermissions = user.permissions ?? []
  const leadPermsCount = (user.permissions ?? []).filter((p) => p.startsWith('leads.')).length

  return (
    <div>
      {/* Breadcrumb + top-right action buttons */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button onClick={onBack} className="hover:text-blue-600 transition-colors flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Manage User
          </button>
          <span>{'>'}</span>
          <span>Edit User</span>
          <span>{'>'}</span>
          <span className="text-gray-800 font-medium">{user.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowVacation(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-600 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors"
          >
            <Plane className="w-3.5 h-3.5" />
            Manage Vacation Mode
          </button>
          <button
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-red-500 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>

      {/* User Card */}
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* User name header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-blue-600">
            <h2 className="text-lg font-semibold text-white">{user.name}</h2>
            <p className="text-sm text-blue-100">{user.email}</p>
          </div>

          {/* Accordion Sections */}
          <div className="divide-y divide-gray-200">
            {/* 1. Basic Details */}
            <div>
              <button
                onClick={() => toggleSection('basic')}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    completedSections.has('basic') ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-gray-800">Basic Details</span>
                </div>
                <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${
                  expandedSection === 'basic' ? 'rotate-90' : ''
                }`} />
              </button>
              {expandedSection === 'basic' && (
                <div className="px-6 pb-4">
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500">Name:</span>{' '}
                        <span className="text-gray-800 font-medium">{user.name}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Email:</span>{' '}
                        <span className="text-gray-800">{user.email}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Phone:</span>{' '}
                        <span className="text-gray-800">{user.phone || 'Not set'}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowBasicDetails(true)}
                      className="mt-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors active:scale-95"
                    >
                      Edit Basic Details
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Role Assignment — expandable, houses Append/Remove actions */}
            <div>
              <button
                onClick={() => toggleSection('role')}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    roleConfigs.length > 0 || completedSections.has('role')
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-800">Role Assignment</p>
                    <p className="text-xs text-gray-400">
                      {roleConfigsLoading
                        ? 'Loading…'
                        : roleConfigs.length > 0
                          ? `${roleConfigs.length} role${roleConfigs.length === 1 ? '' : 's'} selected`
                          : 'No role selected'}
                    </p>
                  </div>
                </div>
                <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === 'role' ? 'rotate-90' : ''}`} />
              </button>
              {expandedSection === 'role' && (
                <div className="px-6 pb-4">
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    {roleConfigs.length > 0 ? (
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1.5">Currently assigned roles</p>
                        <div className="flex flex-wrap gap-1.5">
                          {roleConfigs.map((rc) => {
                            const roleName = roles.find((r) => r.id === rc.roleId)?.name ?? 'Role'
                            const campaignCount = rc.campaigns.length
                            return (
                              <span
                                key={rc.roleId}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-white border border-gray-200 rounded text-gray-700"
                              >
                                {roleName}
                                {campaignCount > 0 && (
                                  <span className="text-gray-400">· {campaignCount} campaign{campaignCount === 1 ? '' : 's'}</span>
                                )}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">No roles assigned yet.</p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setShowRoleWindow('append')}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-600 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Append User Access
                      </button>
                      <button
                        onClick={() => setShowRoleWindow('remove')}
                        disabled={roleConfigs.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-red-500 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                        Remove User Access
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Append adds new roles or campaigns. Remove drops existing access without touching other permissions.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Lead Permissions */}
            <div>
              <button
                onClick={() => toggleSection('leadPerms')}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    leadPermsCount > 0 ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-800">Lead Permissions</p>
                    <p className="text-xs text-gray-400">
                      {leadPermsCount > 0 ? `${leadPermsCount} permission${leadPermsCount === 1 ? '' : 's'} granted` : 'No permission granted'}
                    </p>
                  </div>
                </div>
                <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === 'leadPerms' ? 'rotate-90' : ''}`} />
              </button>
              {expandedSection === 'leadPerms' && (
                <div className="px-6 pb-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-3">
                      Configure lead access, stage-level permissions, and actions — scoped to DTS, DTA, or both pipelines.
                    </p>
                    <button
                      onClick={() => setShowLeadPerms(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors active:scale-95"
                    >
                      Manage Lead Permissions
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Module Permissions */}
            <div>
              <button
                onClick={() => toggleSection('permissions')}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    completedSections.has('permissions') ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-gray-800">Module Permissions</span>
                </div>
                <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${
                  expandedSection === 'permissions' ? 'rotate-90' : ''
                }`} />
              </button>
              {expandedSection === 'permissions' && (
                <div className="px-6 pb-4">
                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <p className="text-xs text-gray-500 mb-2">
                      Toggle permissions directly for this user. Role ({user.role.name}) is just a label.
                    </p>
                    {MODULE_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                          {group.label}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {group.perms.map((perm) => {
                            const active = userPermissions.includes(perm)
                            return (
                              <label key={perm} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={() => togglePermission(perm)}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className={`text-xs font-mono ${active ? 'text-gray-700' : 'text-gray-400'}`}>
                                  {perm}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 4. List Stacking Dialer (placeholder) */}
            <div>
              <button
                onClick={() => toggleSection('dialer')}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gray-100 text-gray-400">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-gray-800">List Stacking Dialer</span>
                </div>
                <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${
                  expandedSection === 'dialer' ? 'rotate-90' : ''
                }`} />
              </button>
              {expandedSection === 'dialer' && (
                <div className="px-6 pb-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-500">
                      List stacking dialer configuration will be available in a future update.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 mt-3">{error}</p>
        )}

        {/* Bottom Buttons */}
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onBack}
            className="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveUser}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors active:scale-95 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save User
          </button>
        </div>
      </div>

      {/* Basic Details Modal */}
      <BasicDetailsModal
        open={showBasicDetails}
        user={user}
        onClose={() => setShowBasicDetails(false)}
        onSave={(updated) => {
          setUser({ ...user, ...updated })
          setShowBasicDetails(false)
          markCompleted('basic')
        }}
      />

      {/* Vacation Mode Modal */}
      <VacationModeModal
        open={showVacation}
        userId={user.id}
        userName={user.name}
        initialEnabled={(user as any).vacationMode ?? false}
        initialStart={(user as any).vacationStart ?? null}
        initialEnd={(user as any).vacationEnd ?? null}
        onClose={() => setShowVacation(false)}
        onSaved={(data) => {
          setUser({ ...user, ...data } as any)
        }}
      />

      {/* Delete User Reassignment Modal */}
      {showDelete && (
        <DeleteUserReassignmentModal
          userId={user.id}
          userName={user.name}
          onClose={() => setShowDelete(false)}
          onDeleted={() => {
            setShowDelete(false)
            router.refresh()
            onBack()
          }}
        />
      )}

      {/* Lead Permissions Modal */}
      <LeadPermissionsModal
        open={showLeadPerms}
        initialPermissions={(user.permissions ?? []).filter((p) => p.startsWith('leads.'))}
        onClose={() => setShowLeadPerms(false)}
        onSave={(nextLeadPerms) => {
          // Replace all leads.* permissions with the new set
          const nonLeads = (user.permissions ?? []).filter((p) => !p.startsWith('leads.'))
          setUser({ ...user, permissions: [...nonLeads, ...nextLeadPerms] })
          markCompleted('leadPerms')
        }}
      />
    </div>
  )
}
