'use client'

/**
 * RolesPanel
 *
 * Displays all roles and their permissions.
 * Create/edit/delete roles (non-system) via API calls.
 *
 * Calls:
 *   POST   /api/roles          — create role
 *   PATCH  /api/roles/[id]     — update name/description/permissions
 *   DELETE /api/roles/[id]     — delete role (non-system only)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import type { Permission } from '@crm/shared'

interface Role {
  id: string
  name: string
  description: string | null
  permissions: Permission[]
  isSystem: boolean
}

interface Props {
  roles: Role[]
}

const MODULE_GROUPS: { label: string; perms: Permission[] }[] = [
  { label: 'Leads', perms: ['leads.view', 'leads.create', 'leads.edit', 'leads.delete'] },
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


export function RolesPanel({ roles: initial }: Props) {
  const router = useRouter()
  const [roles, setRoles] = useState<Role[]>(initial)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function togglePermission(role: Role, perm: Permission) {
    const newPerms = role.permissions.includes(perm)
      ? role.permissions.filter((p) => p !== perm)
      : [...role.permissions, perm]

    setSaving(role.id)
    setError(null)
    try {
      const res = await fetch(`/api/roles/${role.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: newPerms }),
      })
      if (!res.ok) throw new Error('Failed to update role')
      setRoles((prev) =>
        prev.map((r) => r.id === role.id ? { ...r, permissions: newPerms } : r)
      )
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(null)
    }
  }

  async function deleteRole(roleId: string) {
    if (!confirm('Delete this role? Users will need to be reassigned.')) return
    setSaving(roleId)
    try {
      const res = await fetch(`/api/roles/${roleId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete role')
      setRoles((prev) => prev.filter((r) => r.id !== roleId))
      if (expandedId === roleId) setExpandedId(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(null)
    }
  }

  async function createRole() {
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), permissions: [] }),
      })
      if (!res.ok) throw new Error('Failed to create role')
      const json = await res.json()
      setRoles((prev) => [...prev, json.data])
      setNewName('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Roles &amp; Permissions</h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createRole()}
            placeholder="New role name…"
            className="text-sm border border-gray-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
          />
          <button
            onClick={createRole}
            disabled={creating || !newName.trim()}
            className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Create
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {roles.map((role) => (
        <div key={role.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Role header row */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-gray-900">{role.name}</span>
              {role.isSystem && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">System</span>
              )}
              <span className="text-xs text-gray-400">
                {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {!role.isSystem && (
                <button
                  onClick={() => deleteRole(role.id)}
                  disabled={saving === role.id}
                  className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50 rounded-lg hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setExpandedId(expandedId === role.id ? null : role.id)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50"
              >
                {expandedId === role.id
                  ? <ChevronUp className="w-4 h-4" />
                  : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Permission toggles */}
          {expandedId === role.id && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-4">
              {MODULE_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.perms.map((perm) => {
                      const active = role.permissions.includes(perm)
                      const isDisabled = role.isSystem || saving === role.id
                      return (
                        <label key={perm} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={active}
                            disabled={isDisabled}
                            onChange={() => togglePermission(role, perm)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                          />
                          <span className="text-xs text-gray-700 font-mono">{perm}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
              {role.isSystem && (
                <p className="text-xs text-gray-400 mt-1">System roles cannot be modified.</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
