'use client'

import { useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type { UserRow, RoleItem, CampaignItem } from './UsersList'

interface Props {
  user: UserRow
  roles: RoleItem[]
  campaigns: CampaignItem[]
  onBack: () => void
  onUpdate: (updated: UserRow) => void
}

export function RoleAssignmentPanel({ user, roles, campaigns, onBack, onUpdate }: Props) {
  const [selectedRoleId, setSelectedRoleId] = useState(user.role.id)
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedRole = roles.find((r) => r.id === selectedRoleId)

  function toggleCampaign(campaignId: string) {
    setSelectedCampaignIds((prev) =>
      prev.includes(campaignId) ? prev.filter((id) => id !== campaignId) : [...prev, campaignId]
    )
  }

  async function handleUpdate() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId: selectedRoleId,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to update')
      }
      const updatedUser = await res.json()
      onUpdate({
        ...user,
        role: updatedUser.role,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
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
        <span>Append Access</span>
        <span>{'>'}</span>
        <span className="text-gray-800 font-medium">{user.name}</span>
      </div>

      {/* Multi-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Column 1: Roles */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-blue-600">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Roles</h3>
          </div>
          <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
            {roles.map((role) => {
              const isSelected = role.id === selectedRoleId
              return (
                <label
                  key={role.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    checked={isSelected}
                    onChange={() => setSelectedRoleId(role.id)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{role.name}</span>
                      {isSelected && (
                        <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-medium">
                          Selected
                        </span>
                      )}
                    </div>
                    {role.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Column 2: Campaigns */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-blue-600">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Campaigns</h3>
          </div>
          <div className="p-4">
            <p className="text-sm text-gray-600 mb-3">
              Which campaign(s) would you like <span className="font-semibold">{user.name}</span> to
              have access to as <span className="font-semibold">{selectedRole?.name ?? 'their role'}</span>?
            </p>
            <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
              {campaigns.map((campaign) => {
                const isChecked = selectedCampaignIds.includes(campaign.id)
                return (
                  <label
                    key={campaign.id}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleCampaign(campaign.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-sm text-gray-700">{campaign.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        campaign.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {campaign.status}
                      </span>
                    </div>
                  </label>
                )
              })}
              {campaigns.length === 0 && (
                <p className="text-sm text-gray-400 py-2">
                  No campaigns available.
                </p>
              )}
            </div>
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
          onClick={handleUpdate}
          disabled={saving}
          className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors active:scale-95 flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Update User
        </button>
      </div>
    </div>
  )
}
