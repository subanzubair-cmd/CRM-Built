'use client'

/**
 * Email-only blast modal for the Buyers module.
 *
 * SMS broadcasts now go through the dedicated `BulkSmsModal` (the
 * "Send Bulk SMS" flow) which writes to `BulkSmsBlast` + tracks
 * delivery per recipient via the Telnyx webhook. This modal is
 * intentionally limited to EMAIL so we don't duplicate the SMS
 * authoring path — keeping a single source of truth.
 */

import { useState, useEffect } from 'react'
import { Send, X, Mail } from 'lucide-react'

interface Props {
  onClose: () => void
  // When selectedIds is provided, blast only goes to those buyers.
  selectedIds?: string[]
}

export function BuyerBlastModal({ onClose, selectedIds }: Props) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; channel: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Only fetch all-buyer counts when no specific selection is provided.
  const [counts, setCounts] = useState<{ emailEligible: number } | null>(null)

  useEffect(() => {
    if (!selectedIds) {
      fetch('/api/buyers/blast')
        .then((r) => r.json())
        .then((res) => setCounts({ emailEligible: Number(res?.emailEligible ?? 0) }))
        .catch(() => {})
    }
  }, [selectedIds])

  async function send() {
    if (!body.trim()) return
    setSending(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        channel: 'EMAIL',
        body,
        subject: subject || undefined,
      }
      if (selectedIds && selectedIds.length > 0) {
        payload.buyerIds = selectedIds
      }
      const res = await fetch('/api/buyers/blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to send')
        return
      }
      setResult(data)
    } finally {
      setSending(false)
    }
  }

  const recipientLabel = selectedIds
    ? `${selectedIds.length} selected buyer${selectedIds.length !== 1 ? 's' : ''}`
    : counts
      ? `${counts.emailEligible} active buyer${counts.emailEligible !== 1 ? 's' : ''} with email`
      : null

  const sendDisabled =
    sending ||
    !body.trim() ||
    !subject.trim() ||
    (selectedIds ? selectedIds.length === 0 : counts ? counts.emailEligible === 0 : false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-500" />
            {selectedIds
              ? `Email Blast to ${selectedIds.length} buyer${selectedIds.length !== 1 ? 's' : ''}`
              : 'Email Blast'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {result ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Mail className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-base font-semibold text-gray-900">
              {result.sent} email{result.sent === 1 ? '' : 's'} queued
            </p>
            <p className="text-xs text-gray-400 mt-1">
              For SMS broadcasts, use Send Bulk SMS instead.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {recipientLabel && (
              <p className="text-xs text-gray-500 mb-3">{recipientLabel}</p>
            )}

            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Email body…"
              rows={6}
              maxLength={10000}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <p className="text-[11px] text-gray-400 mb-3">
              Need to send a text? Use the Send Bulk SMS button instead — that flow tracks
              delivery per recipient and surfaces results on the SMS Campaign tab.
            </p>

            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={sendDisabled}
                className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {sending
                  ? 'Sending…'
                  : selectedIds
                    ? `Email ${selectedIds.length}`
                    : `Email ${counts ? counts.emailEligible : '…'} buyers`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
