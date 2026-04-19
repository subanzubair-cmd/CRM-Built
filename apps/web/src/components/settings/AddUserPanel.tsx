'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronRight, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react'
import { LeadPermissionsModal } from './LeadPermissionsModal'
import { RoleAssignmentWindow, type RoleConfig } from './RoleAssignmentWindow'
import type { RoleItem, CampaignItem } from './UsersList'
import { COUNTRY_CODES, DEFAULT_COUNTRY } from '@/lib/country-codes'

interface Props {
  roles: RoleItem[]
  campaigns: CampaignItem[]
  /**
   * Preloaded LeadCampaign list from the settings page. When provided, the
   * panel skips its own /api/lead-campaigns fetch — eliminates a round-trip
   * and a visible loading window on open.
   */
  leadCampaigns?: Array<{ id: string; name: string; type: string }>
  onBack: () => void
}

// Note: `leads.*` permissions are intentionally NOT here — they live in the
// dedicated Lead Permissions section above, which also handles per-stage and
// per-action scopes. Listing them in both places led to confusing duplication.
const MODULE_GROUPS: { label: string; perms: string[] }[] = [
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

const DIALER_PERMISSIONS = [
  { key: 'dialer.access', label: 'Access Dialer' },
  { key: 'dialer.make_calls', label: 'Make Calls via Dialer' },
  { key: 'dialer.view_recordings', label: 'View Call Recordings' },
]

export function AddUserPanel({ roles, campaigns, leadCampaigns: leadCampaignsProp, onBack }: Props) {
  const router = useRouter()
  const [expandedSection, setExpandedSection] = useState<string | null>('basic')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Basic Details
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState(DEFAULT_COUNTRY)

  // Password setup mode
  const [passwordMode, setPasswordMode] = useState<'set' | 'invite'>('invite')
  const [password, setPassword] = useState('')

  // Role Assignment (just a label now)
  const [roleId, setRoleId] = useState<string>('')

  // Permissions (all editable directly on user)
  const [leadPerms, setLeadPerms] = useState<Set<string>>(new Set())
  const [modulePerms, setModulePerms] = useState<Set<string>>(new Set())
  const [dialerPerms, setDialerPerms] = useState<Set<string>>(new Set())
  const [showLeadPerms, setShowLeadPerms] = useState(false)

  // Role Assignment Window state
  const [showRoleWindow, setShowRoleWindow] = useState(false)
  const [roleConfigs, setRoleConfigs] = useState<RoleConfig[]>([])
  const [leadCampaigns, setLeadCampaigns] = useState<{ id: string; name: string; type: string }[]>(
    leadCampaignsProp ?? [],
  )

  // Only fetch lead-campaigns client-side when the SSR-preloaded prop wasn't supplied.
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

  const selectedRole = roles.find((r) => r.id === roleId)

  const basicComplete = Boolean(firstName.trim() && email.trim() && phone.trim())
  const roleComplete = !!roleId
  const leadsComplete = leadPerms.size > 0
  const moduleComplete = modulePerms.size > 0
  const dialerComplete = dialerPerms.size > 0

  function toggleSection(section: string) {
    setExpandedSection(expandedSection === section ? null : section)
  }

  function togglePerm(set: Set<string>, setter: (s: Set<string>) => void, perm: string) {
    const next = new Set(set)
    if (next.has(perm)) next.delete(perm)
    else next.add(perm)
    setter(next)
  }

  async function handleSubmit() {
    if (!firstName.trim() || !email.trim() || !phone.trim()) {
      setError('First name, email, and phone are required')
      setExpandedSection('basic')
      return
    }
    if (passwordMode === 'set' && password.trim().length < 8) {
      setError('Password must be at least 8 characters')
      setExpandedSection('basic')
      return
    }
    if (!roleComplete) {
      setError('Please assign a role')
      setShowRoleWindow(true)
      return
    }
    setSaving(true)
    setError('')
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName,
          email: email.trim(),
          phone: `${COUNTRY_CODES.find((c) => c.value === country)?.code ?? '+1'} ${phone.trim()}`,
          roleId,
          permissions: [...leadPerms, ...modulePerms, ...dialerPerms],
          ...(passwordMode === 'set'
            ? { password: password.trim() }
            : { sendInviteEmail: true }),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to add user')
      }

      const createdUser = await res.json()
      const newUserId = createdUser?.id

      // Deferred POST of role configs, only after the user was created successfully
      if (newUserId && roleConfigs.length > 0) {
        try {
          const cfgRes = await fetch(`/api/users/${newUserId}/role-configs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ configs: roleConfigs }),
          })
          if (!cfgRes.ok) {
            const data = await cfgRes.json().catch(() => ({}))
            toast.error(data?.error ?? 'Failed to save role configurations')
          }
        } catch (cfgErr) {
          toast.error(
            cfgErr instanceof Error ? cfgErr.message : 'Failed to save role configurations',
          )
        }
      }

      router.refresh()
      onBack()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add user'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (showRoleWindow) {
    return (
      <RoleAssignmentWindow
        fullName={`${firstName} ${lastName}`.trim()}
        roles={roles}
        leadCampaigns={leadCampaigns}
        initialConfigs={roleConfigs}
        mode="create"
        onClose={() => setShowRoleWindow(false)}
        onSave={(configs) => {
          setRoleConfigs(configs)
          // Preserve the existing user creation API — it still expects a single roleId,
          // so use the first configured role as the "primary" role.
          if (configs.length > 0 && configs[0]?.roleId) {
            setRoleId(configs[0].roleId)
          }
          setShowRoleWindow(false)
        }}
      />
    )
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button onClick={onBack} className="hover:text-blue-600 transition-colors flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          Manage User
        </button>
        <span>{'>'}</span>
        <span className="text-gray-800 font-medium">Add New User</span>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-blue-600">
            <h2 className="text-lg font-semibold text-white">Add New User</h2>
            <p className="text-sm text-blue-100">Fill in each section below</p>
          </div>

          <div className="divide-y divide-gray-200">
            {/* 1. Basic Details */}
            <SectionHeader
              icon={basicComplete}
              title="Basic Details"
              subtitle={basicComplete ? `${firstName} ${lastName}` : 'Not provided'}
              expanded={expandedSection === 'basic'}
              onClick={() => toggleSection('basic')}
            />
            {expandedSection === 'basic' && (
              <div className="px-6 pb-4">
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <LabeledInput label="First Name *" value={firstName} onChange={setFirstName} placeholder="Jane" />
                    <LabeledInput label="Last Name" value={lastName} onChange={setLastName} placeholder="Smith" />
                  </div>
                  <LabeledInput label="Email *" type="email" value={email} onChange={setEmail} placeholder="jane@homewardpartners.com" />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phone *</label>
                    <div className="flex gap-2">
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[130px]"
                      >
                        {COUNTRY_CODES.map((c) => (
                          <option key={`${c.value}-${c.code}`} value={c.value}>
                            {c.code} {c.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                        placeholder="(555) 000-0000"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Password setup mode */}
                  <div className="pt-2 border-t border-gray-100">
                    <label className="block text-xs font-medium text-gray-600 mb-2">Password *</label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="passwordMode"
                          checked={passwordMode === 'invite'}
                          onChange={() => setPasswordMode('invite')}
                          className="mt-0.5 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <p className="text-sm text-gray-800">Send a password setup link via email</p>
                          <p className="text-[11px] text-gray-500">User receives a one-time link to create their own password.</p>
                        </div>
                      </label>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="passwordMode"
                          checked={passwordMode === 'set'}
                          onChange={() => setPasswordMode('set')}
                          className="mt-0.5 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <p className="text-sm text-gray-800">Set password now</p>
                          {passwordMode === 'set' && (
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="At least 8 characters"
                              autoFocus
                              className="mt-1.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          )}
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Role Assignment */}
            <SectionHeader
              icon={roleConfigs.length > 0 || roleComplete}
              title="Role Assignment"
              subtitle={
                roleConfigs.length > 0
                  ? `${roleConfigs.length} role${roleConfigs.length === 1 ? '' : 's'} selected`
                  : 'No role selected'
              }
              expanded={false}
              onClick={() => setShowRoleWindow(true)}
            />

            {/* 3. Lead Permissions */}
            <SectionHeader
              icon={leadsComplete}
              title="Lead Permissions"
              subtitle={leadsComplete ? `${leadPerms.size} permission${leadPerms.size === 1 ? '' : 's'} granted` : 'No permission granted'}
              expanded={expandedSection === 'leads'}
              onClick={() => toggleSection('leads')}
            />
            {expandedSection === 'leads' && (
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

            {/* Module Permissions */}
            <SectionHeader
              icon={moduleComplete}
              title="Module Permissions"
              subtitle={moduleComplete ? `${modulePerms.size} permission${modulePerms.size === 1 ? '' : 's'} granted` : 'No permission granted'}
              expanded={expandedSection === 'modules'}
              onClick={() => toggleSection('modules')}
            />
            {expandedSection === 'modules' && (
              <div className="px-6 pb-4">
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  {MODULE_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        {group.label}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.perms.map((perm) => (
                          <label key={perm} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={modulePerms.has(perm)}
                              onChange={() => togglePerm(modulePerms, setModulePerms, perm)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className={`text-xs font-mono ${modulePerms.has(perm) ? 'text-gray-700' : 'text-gray-400'}`}>
                              {perm}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. List Stacking Dialer */}
            <SectionHeader
              icon={dialerComplete}
              title="List Stacking Dialer"
              subtitle={dialerComplete ? `${dialerPerms.size} permission${dialerPerms.size === 1 ? '' : 's'} granted` : 'No permission granted'}
              expanded={expandedSection === 'dialer'}
              onClick={() => toggleSection('dialer')}
            />
            {expandedSection === 'dialer' && (
              <div className="px-6 pb-4">
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  {DIALER_PERMISSIONS.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dialerPerms.has(p.key)}
                        onChange={() => togglePerm(dialerPerms, setDialerPerms, p.key)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        {/* Footer buttons */}
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onBack}
            className="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !basicComplete || !roleComplete}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors active:scale-95 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Add User
          </button>
        </div>
      </div>

      <LeadPermissionsModal
        open={showLeadPerms}
        initialPermissions={[...leadPerms]}
        onClose={() => setShowLeadPerms(false)}
        onSave={(next) => setLeadPerms(new Set(next))}
      />
    </div>
  )
}

/* ─── Reusable sub-components ─── */

function SectionHeader({
  icon,
  title,
  subtitle,
  expanded,
  onClick,
}: {
  icon: boolean
  title: string
  subtitle: string
  expanded: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center ${
            icon ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
        </div>
        <div className="text-left">
          <p className="font-medium text-gray-800">{title}</p>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
      </div>
      <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
    </button>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
