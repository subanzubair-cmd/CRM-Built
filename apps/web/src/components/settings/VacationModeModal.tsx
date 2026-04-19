'use client'

import { useState } from 'react'
import { X, Loader2, Plane } from 'lucide-react'

interface Props {
  open: boolean
  userId: string
  userName: string
  initialEnabled: boolean
  initialStart: string | null
  initialEnd: string | null
  onClose: () => void
  onSaved: (data: { vacationMode: boolean; vacationStart: string | null; vacationEnd: string | null }) => void
}

export function VacationModeModal({
  open, userId, userName, initialEnabled, initialStart, initialEnd, onClose, onSaved,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [start, setStart] = useState(initialStart?.slice(0, 10) ?? '')
  const [end, setEnd] = useState(initialEnd?.slice(0, 10) ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vacationMode: enabled,
          vacationStart: enabled && start ? start : null,
          vacationEnd: enabled && end ? end : null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to save vacation mode')
      }
      onSaved({
        vacationMode: enabled,
        vacationStart: enabled && start ? start : null,
        vacationEnd: enabled && end ? end : null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Plane className="w-4 h-4 text-blue-600" />
            <h2 className="text-[15px] font-semibold text-gray-900">Manage Vacation Mode</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Manage vacation mode for <span className="font-semibold">{userName}</span>.
          </p>

          <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">Enable vacation mode</p>
              <p className="text-xs text-gray-500 mt-0.5">
                New leads won&apos;t be auto-assigned to this user. Notifications from their existing leads will route to
                users with the same role, or fall back to the acquisition manager, co-owner, and owner if none are available.
              </p>
            </div>
          </label>

          {enabled && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors active:scale-95 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
