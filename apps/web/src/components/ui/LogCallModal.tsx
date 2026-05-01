'use client'

import { useState } from 'react'
import { Loader2, Phone, X } from 'lucide-react'
import { toast } from 'sonner'

type Outcome = 'CONNECTED' | 'NOT_CONNECTED' | 'LEFT_VOICEMAIL'

interface Props {
  open: boolean
  onClose: () => void
  toPhone: string
  entityType: 'buyer' | 'vendor'
  entityId: string
}

const OUTCOMES: Array<{ value: Outcome; label: string; desc: string }> = [
  { value: 'CONNECTED', label: 'Connected', desc: 'Spoke with the contact' },
  { value: 'NOT_CONNECTED', label: 'Not Connected', desc: 'No answer / busy / hung up' },
  { value: 'LEFT_VOICEMAIL', label: 'Left Voicemail', desc: 'Left a voicemail message' },
]

export function LogCallModal({ open, onClose, toPhone, entityType, entityId }: Props) {
  const [outcome, setOutcome] = useState<Outcome>('CONNECTED')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function handleSubmit() {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        phone: toPhone,
        outcome,
        notes: notes.trim() || undefined,
      }
      const parsed = parseInt(durationMinutes, 10)
      if (!isNaN(parsed) && parsed > 0) {
        payload.durationMinutes = parsed
      }

      const res = await fetch(`/api/${entityType}s/${entityId}/log-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = typeof data.error === 'string' ? data.error : 'Failed to log call.'
        toast.error(msg)
        return
      }
      toast.success('Call logged.')
      setOutcome('CONNECTED')
      setDurationMinutes('')
      setNotes('')
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to log call.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
            <Phone className="w-4 h-4 text-green-500" />
            Log Call
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
            <p className="text-sm font-medium text-gray-900">{toPhone}</p>
          </div>

          {/* Outcome */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Outcome *
            </label>
            <div className="space-y-2">
              {OUTCOMES.map((o) => (
                <label
                  key={o.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    outcome === o.value
                      ? 'border-green-500 bg-green-50/50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="callOutcome"
                    checked={outcome === o.value}
                    onChange={() => setOutcome(o.value)}
                    className="mt-0.5 text-green-600 focus:ring-green-500"
                  />
                  <div>
                    <span className="text-[13px] font-medium text-gray-900">{o.label}</span>
                    <p className="text-[11px] text-gray-500 mt-0.5">{o.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Duration (minutes, optional)
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder="e.g. 5"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add call notes…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Logging…' : 'Log Call'}
          </button>
        </div>
      </div>
    </div>
  )
}
