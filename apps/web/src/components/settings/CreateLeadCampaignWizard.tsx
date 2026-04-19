'use client'

/**
 * CreateLeadCampaignWizard
 *
 * Two-step modal wizard to create a LeadCampaign and claim a phone number.
 *
 * Step 1: pick campaign type (DTS / DTA / BUYER / VENDOR)
 * Step 2:
 *   - BUYER / VENDOR: name + assigned users (direct assignment)
 *   - DTS / DTA: full form (name, lead source, flow, assignment method, roles)
 *
 * POST /api/lead-campaigns
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { X, Loader2, ChevronRight, Phone } from 'lucide-react'

type CampaignType = 'DTS' | 'DTA' | 'BUYER' | 'VENDOR'
type AssignmentMethod = 'ROUND_ROBIN' | 'FIRST_TO_CLAIM' | 'MANUAL'

interface LeadSourceOption {
  id: string
  name: string
  isActive: boolean
  isSystem: boolean
}

interface RoleOption {
  id: string
  name: string
}

interface ApiUser {
  id: string
  name?: string
  email?: string
  status: 'ACTIVE' | 'INACTIVE' | 'INVITED' | 'SUSPENDED'
  role?: { id: string; name: string } | null
  roleId?: string | null
}

interface UserOption {
  id: string
  name: string
  email: string
}

interface ExistingCampaign {
  id: string
  name: string
  type: CampaignType
  leadSourceId: string | null
  assignmentMethod: AssignmentMethod
  roleToggles: Array<{ roleId: string; enabled: boolean }>
  assignedUserIds?: string[]
}

interface Props {
  phoneNumber: { id: string; number: string; friendlyName: string | null }
  existingCampaign?: ExistingCampaign | null  // present in edit mode
  onClose: () => void
  onCreated: () => void
}

const TYPE_OPTIONS: Array<{
  type: CampaignType
  label: string
  description: string
  emoji: string
}> = [
  { type: 'DTS', label: 'DTS', description: 'Direct to Seller', emoji: '🏠' },
  { type: 'DTA', label: 'DTA', description: 'Direct to Agent', emoji: '👔' },
  { type: 'BUYER', label: 'Buyer', description: 'Buyer outreach', emoji: '🤝' },
  { type: 'VENDOR', label: 'Vendor', description: 'Vendor communication', emoji: '🛠️' },
]

const ASSIGNMENT_OPTIONS: Array<{ value: AssignmentMethod; label: string }> = [
  { value: 'ROUND_ROBIN', label: 'Round Robin' },
  { value: 'FIRST_TO_CLAIM', label: 'First to Claim' },
  { value: 'MANUAL', label: 'Manual Assignment' },
]

function formatNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '')
  if (raw.startsWith('+1') && digits.length === 11) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return raw
}

export function CreateLeadCampaignWizard({ phoneNumber, existingCampaign, onClose, onCreated }: Props) {
  const isEditMode = !!existingCampaign
  // In edit mode, skip Step 1 (type is already set and not changeable in this wizard).
  const [step, setStep] = useState<1 | 2>(isEditMode ? 2 : 1)
  const [type, setType] = useState<CampaignType | null>(existingCampaign?.type ?? null)

  // Step 2 state (full form) — pre-fill in edit mode
  const [name, setName] = useState(existingCampaign?.name ?? '')
  const [leadSourceId, setLeadSourceId] = useState(existingCampaign?.leadSourceId ?? '')
  const [assignmentMethod, setAssignmentMethod] = useState<AssignmentMethod>(
    existingCampaign?.assignmentMethod ?? 'ROUND_ROBIN'
  )
  const [roleToggles, setRoleToggles] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    if (existingCampaign?.roleToggles) {
      for (const t of existingCampaign.roleToggles) initial[t.roleId] = t.enabled
    }
    return initial
  })
  // Buyer/Vendor direct user assignment
  const [assignedUserIds, setAssignedUserIds] = useState<Set<string>>(
    () => new Set(existingCampaign?.assignedUserIds ?? [])
  )

  // Data
  const [sources, setSources] = useState<LeadSourceOption[]>([])
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)

  const [saving, setSaving] = useState(false)

  const needsFullForm = type === 'DTS' || type === 'DTA'
  const needsUserPicker = type === 'BUYER' || type === 'VENDOR'

  const loadFormOptions = useCallback(async () => {
    setLoadingOptions(true)
    try {
      // Lead sources (active only) — only fetch for full-form types
      if (needsFullForm) {
        const srcRes = await fetch('/api/lead-sources?isActive=true')
        const srcJson = await srcRes.json().catch(() => ({ data: [] }))
        const activeSources: LeadSourceOption[] = (srcJson.data ?? []).filter(
          (s: LeadSourceOption) => s.isActive,
        )
        setSources(activeSources)
      }

      // Fetch all active users (needed for both roles derivation AND user picker)
      const usersRes = await fetch('/api/users')
      if (!usersRes.ok) {
        setRoles([])
        setAllUsers([])
        return
      }
      const usersJson = (await usersRes.json()) as ApiUser[] | { data?: ApiUser[] }
      const users: ApiUser[] = Array.isArray(usersJson)
        ? usersJson
        : Array.isArray((usersJson as any).data)
          ? (usersJson as any).data
          : []

      // Roles for full-form types: derive from active users
      if (needsFullForm) {
        const roleMap = new Map<string, RoleOption>()
        for (const u of users) {
          if (u.status !== 'ACTIVE') continue
          const r = u.role
          if (r?.id && r?.name && !roleMap.has(r.id)) {
            roleMap.set(r.id, { id: r.id, name: r.name })
          }
        }
        const derivedRoles = Array.from(roleMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name),
        )
        setRoles(derivedRoles)
      }

      // Active user list for Buyer/Vendor picker
      if (needsUserPicker) {
        const opts: UserOption[] = users
          .filter((u) => u.status === 'ACTIVE' && u.name)
          .map((u) => ({ id: u.id, name: u.name ?? '', email: u.email ?? '' }))
          .sort((a, b) => a.name.localeCompare(b.name))
        setAllUsers(opts)
      }
    } catch {
      toast.error('Failed to load campaign options')
    } finally {
      setLoadingOptions(false)
    }
  }, [needsFullForm, needsUserPicker])

  // When moving to step 2 (any type), load options
  useEffect(() => {
    if (step === 2 && (needsFullForm || needsUserPicker)) {
      loadFormOptions()
    }
  }, [step, needsFullForm, needsUserPicker, loadFormOptions])

  // In edit mode, load options immediately on mount
  useEffect(() => {
    if (isEditMode && (needsFullForm || needsUserPicker)) {
      loadFormOptions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleRole(roleId: string) {
    setRoleToggles((prev) => ({ ...prev, [roleId]: !prev[roleId] }))
  }

  async function handleSave() {
    if (!type) return

    let payload: Record<string, unknown>
    if (type === 'BUYER' || type === 'VENDOR') {
      if (!name.trim()) {
        toast.error('Campaign name is required')
        return
      }
      payload = {
        type,
        name: name.trim(),
        phoneNumberId: phoneNumber.id,
        assignedUserIds: Array.from(assignedUserIds),
      }
    } else {
      if (!name.trim()) {
        toast.error('Campaign name is required')
        return
      }
      if (!leadSourceId) {
        toast.error('Lead source is required')
        return
      }
      payload = {
        type,
        name: name.trim(),
        phoneNumberId: phoneNumber.id,
        leadSourceId,
        assignmentMethod,
        roleToggles: roles.map((r) => ({
          roleId: r.id,
          enabled: Boolean(roleToggles[r.id]),
        })),
      }
    }

    setSaving(true)
    try {
      const url = isEditMode
        ? `/api/lead-campaigns/${existingCampaign!.id}`
        : '/api/lead-campaigns'
      const method = isEditMode ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' ? json.error : `Failed to ${isEditMode ? 'update' : 'create'} campaign`
        )
      }
      toast.success(isEditMode ? 'Campaign updated' : 'Campaign created')
      onCreated()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `Failed to ${isEditMode ? 'update' : 'create'} campaign`
      )
    } finally {
      setSaving(false)
    }
  }

  const displayNumber = formatNumber(phoneNumber.number)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">
              {isEditMode ? 'Edit Lead Campaign' : 'Create Lead Campaign'}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
              <Phone className="w-3 h-3" />
              <span className="font-mono">{displayNumber}</span>
              {phoneNumber.friendlyName && (
                <span className="text-gray-400">· {phoneNumber.friendlyName}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
          <span
            className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold ${
              step === 1 ? 'bg-blue-600 text-white' : 'bg-emerald-500 text-white'
            }`}
          >
            1
          </span>
          <span className={step === 1 ? 'text-gray-900 font-medium' : ''}>Campaign Type</span>
          <ChevronRight className="w-3 h-3 text-gray-300" />
          <span
            className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold ${
              step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}
          >
            2
          </span>
          <span className={step === 2 ? 'text-gray-900 font-medium' : ''}>Configuration</span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                What will this number be used for?
              </p>
              <div className="grid grid-cols-2 gap-3">
                {TYPE_OPTIONS.map((opt) => {
                  const selected = type === opt.type
                  return (
                    <button
                      key={opt.type}
                      onClick={() => setType(opt.type)}
                      className={`flex items-start gap-3 p-4 border-2 rounded-xl text-left transition-all ${
                        selected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {step === 2 && (type === 'BUYER' || type === 'VENDOR') && (
            <div className="space-y-4">
              {/* Read-only type */}
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">
                  You will use this number for
                </label>
                <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-800 font-medium">
                  {type === 'BUYER' ? 'Buyer' : 'Vendor'}
                </div>
              </div>

              {/* Campaign Name */}
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={type === 'BUYER' ? 'e.g. DFW Buyer Outreach' : 'e.g. DFW Vendor Line'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* User Assignment */}
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">
                  Assign Users
                </label>
                <p className="text-[11px] text-gray-400 mb-2">
                  Select one or more users who will handle this{' '}
                  {type === 'BUYER' ? 'buyer' : 'vendor'} line.
                </p>
                {loadingOptions ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading users…
                  </div>
                ) : allUsers.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 italic">
                    No active users available.
                  </p>
                ) : (
                  <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
                    {allUsers.map((u) => {
                      const checked = assignedUserIds.has(u.id)
                      return (
                        <label
                          key={u.id}
                          className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer transition-colors ${
                            checked ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setAssignedUserIds((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(u.id)) next.delete(u.id)
                                  else next.add(u.id)
                                  return next
                                })
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-sm text-gray-800 truncate">{u.name}</p>
                              <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                            </div>
                          </div>
                          {checked && (
                            <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide flex-shrink-0">
                              Selected
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                )}
                <p className="text-[11px] text-gray-400 mt-1">
                  {assignedUserIds.size} user{assignedUserIds.size === 1 ? '' : 's'} selected
                </p>
              </div>
            </div>
          )}

          {step === 2 && needsFullForm && (
            <div className="space-y-4">
              {/* Read-only type */}
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">
                  You will use this number for
                </label>
                <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-800 font-medium">
                  {type}
                </div>
              </div>

              {/* Campaign Name */}
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">
                  Campaign Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dallas DTS - Q2"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Lead Source */}
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">
                  Lead Source <span className="text-red-500">*</span>
                </label>
                <select
                  value={leadSourceId}
                  onChange={(e) => setLeadSourceId(e.target.value)}
                  disabled={loadingOptions}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">
                    {loadingOptions ? 'Loading...' : 'Select a source'}
                  </option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Flow Name (disabled) */}
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">
                  Flow Name
                </label>
                <select
                  disabled
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
                >
                  <option>(Coming soon — Call Flow builder)</option>
                </select>
              </div>

              {/* Assignment Method */}
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">
                  How would you like leads to be assigned?{' '}
                  <span className="text-red-500">*</span>
                </label>
                <select
                  value={assignmentMethod}
                  onChange={(e) => setAssignmentMethod(e.target.value as AssignmentMethod)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ASSIGNMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Role Assignment toggles */}
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">
                  Role Assignment
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Toggle which roles can be assigned to leads from this campaign.
                </p>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {loadingOptions ? (
                    <div className="px-3 py-4 text-center text-sm text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Loading roles...
                    </div>
                  ) : roles.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-gray-400">
                      No roles with active users found.
                    </div>
                  ) : (
                    roles.map((r) => {
                      const enabled = Boolean(roleToggles[r.id])
                      return (
                        <label
                          key={r.id}
                          className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
                        >
                          <span className="text-sm text-gray-800">{r.name}</span>
                          <button
                            type="button"
                            onClick={() => toggleRole(r.id)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              enabled ? 'bg-blue-600' : 'bg-gray-300'
                            }`}
                            role="switch"
                            aria-checked={enabled}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                enabled ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-3 bg-gray-50 border-t border-gray-100 rounded-b-xl">
          <div>
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                disabled={saving}
                className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            {step === 1 ? (
              <button
                onClick={() => setStep(2)}
                disabled={!type}
                className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
