'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserCheck, UserX, UserPlus, Trash2 } from 'lucide-react'
import { InviteUserModal } from './InviteUserModal'

interface UserRow {
  id: string
  name: string
  email: string
  phone: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'INVITED'
  role: { id: string; name: string }
  marketIds: string[]
}

interface Role {
  id: string
  name: string
}

interface Props {
  users: UserRow[]
  roles: Role[]
  currentUserId: string
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  INACTIVE: 'bg-gray-100 text-gray-500',
  INVITED: 'bg-amber-50 text-amber-700',
}

export function TeamTable({ users, roles, currentUserId }: Props) {
  const router = useRouter()
  const [inviteOpen, setInviteOpen] = useState(false)

  async function removeUser(user: UserRow) {
    if (!confirm(`Permanently remove ${user.name}? This cannot be undone.`)) return
    await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function toggleStatus(user: UserRow) {
    if (user.id === currentUserId) return
    const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    router.refresh()
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            {users.length} team member{users.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invite User
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Name', 'Email', 'Role', 'Status', ''].map((h) => (
                <th key={h} className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3 text-gray-600">{u.role.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[u.status] ?? ''}`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {u.id !== currentUserId && u.status !== 'INVITED' && (
                      <button
                        onClick={() => toggleStatus(u)}
                        className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${u.status === 'ACTIVE' ? 'text-red-500 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-700'}`}
                        title={u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      >
                        {u.status === 'ACTIVE' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                    {u.id !== currentUserId && (
                      <button
                        onClick={() => removeUser(u)}
                        className="flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-red-600 transition-colors"
                        title="Remove user"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InviteUserModal open={inviteOpen} onClose={() => setInviteOpen(false)} roles={roles} />
    </>
  )
}
