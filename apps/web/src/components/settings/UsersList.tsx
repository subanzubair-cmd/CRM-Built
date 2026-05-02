'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, UserPlus } from 'lucide-react'
import { formatPhone } from '@/lib/phone'
import { AddUserPanel } from './AddUserPanel'
import { EditUserPanel } from './EditUserPanel'

export interface UserRow {
  id: string
  name: string
  email: string
  phone: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'INVITED'
  role: { id: string; name: string; permissions: string[] }
  // Every role the user has via UserRoleConfig. Rendered as a list in the
  // Roles column; falls back to `role.name` when empty (e.g. legacy users
  // without per-role config rows).
  roleConfigs?: Array<{ roleId: string; role: { id: string; name: string } }>
  permissions: string[]  // Direct user permissions (decoupled from role)
  marketIds: string[]
  vacationMode?: boolean
  vacationStart?: string | null
  vacationEnd?: string | null
}

export interface RoleItem {
  id: string
  name: string
  description: string | null
  permissions: string[]
  isSystem: boolean
}

export interface CampaignItem {
  id: string
  name: string
  marketId: string | null
  status: string
}

export interface LeadCampaignItem {
  id: string
  name: string
  type: string
}

interface Props {
  users: UserRow[]
  roles: RoleItem[]
  campaigns: CampaignItem[]
  leadCampaigns?: LeadCampaignItem[]
  currentUserId: string
}

export function UsersList({ users, roles, campaigns, leadCampaigns, currentUserId }: Props) {
  const router = useRouter()
  const [addingUser, setAddingUser] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)

  return (
    <>
      {addingUser ? (
        <AddUserPanel
          roles={roles}
          campaigns={campaigns}
          leadCampaigns={leadCampaigns}
          onBack={() => {
            setAddingUser(false)
            router.refresh()
          }}
        />
      ) : editingUser ? (
        <EditUserPanel
          user={editingUser}
          roles={roles}
          campaigns={campaigns}
          leadCampaigns={leadCampaigns}
          onBack={() => {
            setEditingUser(null)
            router.refresh()
          }}
        />
      ) : (
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Settings {'>'} Users ({users.length})
              </h2>
            </div>
            <button
              onClick={() => setAddingUser(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              + Add New
            </button>
          </div>

          {/* Users Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Team Member Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Roles
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditingUser(u)}
                        className="text-blue-600 hover:text-blue-700 font-medium hover:underline transition-colors"
                      >
                        {u.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {u.roleConfigs && u.roleConfigs.length > 0
                        ? u.roleConfigs.map((rc) => rc.role.name).join(', ')
                        : <span className="text-gray-400">&mdash;</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {u.email}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatPhone(u.phone) || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditingUser(u)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit user"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No team members found. Click &quot;+ Add New&quot; to invite someone.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </>
  )
}
