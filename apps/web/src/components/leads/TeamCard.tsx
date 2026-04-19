'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface TeamUser {
  id: string
  name: string | null
  email: string
}

interface TeamRow {
  roleId: string
  roleName: string
  users: TeamUser[]
  assignedUserId: string | null
}

interface TeamData {
  leadCampaignId?: string
  rows: TeamRow[]
}

interface Props {
  propertyId: string
}

export function TeamCard({ propertyId }: Props) {
  const [rows, setRows] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/leads/${propertyId}/team`)
        if (!res.ok) throw new Error('Failed to load team')
        const json = (await res.json()) as { data: TeamData }
        if (!cancelled) setRows(json.data.rows ?? [])
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Failed to load team')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [propertyId])

  async function handleChange(roleId: string, userId: string) {
    const newUserId = userId || null
    const prevRows = rows

    // Optimistic update
    const nextRows = rows.map((r) =>
      r.roleId === roleId ? { ...r, assignedUserId: newUserId } : r,
    )
    setRows(nextRows)
    setSaving(true)

    try {
      const res = await fetch(`/api/leads/${propertyId}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignments: nextRows.map((r) => ({
            roleId: r.roleId,
            userId: r.assignedUserId,
          })),
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error ?? 'Failed to save')
      }
    } catch (err) {
      setRows(prevRows) // revert
      toast.error(err instanceof Error ? err.message : 'Failed to save assignment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">Team</h3>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-500 py-2">
          This lead is not part of a Lead Campaign. Assign a campaign in the lead detail page to enable team management.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 pb-2">
                Role to Assign
              </th>
              <th className="text-left text-xs font-medium text-gray-500 pb-2">
                Assigned To
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.roleId}>
                <td className="py-2.5 text-gray-800">{row.roleName}</td>
                <td className="py-2.5">
                  <select
                    value={row.assignedUserId ?? ''}
                    onChange={(e) => handleChange(row.roleId, e.target.value)}
                    disabled={saving}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                  >
                    <option value="">Unassigned</option>
                    {row.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name ?? u.email}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
