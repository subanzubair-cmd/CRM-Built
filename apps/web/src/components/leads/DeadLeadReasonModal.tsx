'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'

/**
 * Preset reason codes shown as checkboxes. Order matches the screenshot
 * the user supplied. The label is what's stored in the array — the same
 * string flows to ActivityLog.detail and to DeadReasonsCard so admins see
 * exactly what the operator clicked.
 */
export const DEAD_REASON_OPTIONS = [
  'Could not get in touch with the seller',
  'Needs too much work',
  'No motivation to sell/not interested in selling',
  'Non-working phone number',
  'Not the owner',
  'One of the siblings doesn’t want to sell',
  'Property already listed on MLS',
  'Property already sold',
  'Seller accepted another offer',
  'Seller decided to list the property on MLS',
  'Seller wants too much for the house',
  'Sellers owes too much',
  'Solicitation',
  'Title issues',
  'Unable to sell/Find a buyer',
  'Wants to be taken off the list',
  'Zoning issues',
] as const

interface Props {
  /**
   * Called with the captured reasons when the user confirms. The parent
   * (LeadDetailHeader) sends these to PATCH /api/leads/[id] alongside
   * `leadStatus: 'DEAD'`.
   */
  onConfirm: (payload: {
    deadReasons: string[]
    deadOtherReason: string | null
  }) => Promise<void>
  onCancel: () => void
}

export function DeadLeadReasonModal({ onConfirm, onCancel }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [other, setOther] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggle(reason: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(reason)) next.delete(reason)
      else next.add(reason)
      return next
    })
  }

  async function handleConfirm() {
    const reasons = Array.from(checked)
    const otherTrimmed = other.trim()

    // At least one signal is required so the audit trail is meaningful.
    // Either a checkbox OR a non-empty "Other" entry counts.
    if (reasons.length === 0 && otherTrimmed.length === 0) {
      setError('Pick at least one reason or describe it under “Other Reasons”.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onConfirm({
        deadReasons: reasons,
        deadOtherReason: otherTrimmed.length > 0 ? otherTrimmed : null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={saving ? undefined : onCancel}
      />
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — uses brand blue (matches ChangeCampaignModal). */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 bg-blue-600">
          <h2 className="text-base font-semibold text-white tracking-wide uppercase">
            Lead Status &mdash; Dead Lead
          </h2>
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-white/80 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ul className="space-y-2.5">
            {DEAD_REASON_OPTIONS.map((reason) => {
              const id = `dead-reason-${reason.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
              const isChecked = checked.has(reason)
              return (
                <li key={reason}>
                  <label
                    htmlFor={id}
                    className="flex items-center gap-2 cursor-pointer text-sm text-gray-800"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(reason)}
                      disabled={saving}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-semibold">{reason}</span>
                  </label>
                </li>
              )
            })}
          </ul>

          <div className="mt-5">
            <label className="block text-sm font-bold text-gray-800 mb-1.5">
              Other Reasons
            </label>
            <textarea
              value={other}
              onChange={(e) => setOther(e.target.value)}
              disabled={saving}
              rows={3}
              placeholder="Other Reasons"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Saved verbatim alongside the checked reasons.
            </p>
          </div>

          {error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Update Status
          </button>
        </div>
      </div>
    </div>
  )
}
