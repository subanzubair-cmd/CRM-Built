'use client'

import { useState, useEffect } from 'react'
import { Send, X } from 'lucide-react'

interface Props {
  onClose: () => void
  // When selectedIds is provided, blast only goes to those buyers
  selectedIds?: string[]
}

export function BuyerBlastModal({ onClose, selectedIds }: Props) {
  const [channel, setChannel] = useState<'SMS' | 'EMAIL'>('SMS')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; channel: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Only fetch all-buyer counts when no specific selection is provided
  const [counts, setCounts] = useState<{ smsEligible: number; emailEligible: number } | null>(null)

  useEffect(() => {
    if (!selectedIds) {
      fetch('/api/buyers/blast')
        .then((r) => r.json())
        .then(setCounts)
        .catch(() => {})
    }
  }, [selectedIds])

  async function send() {
    if (!body.trim()) return
    setSending(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        channel,
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

  // Determine recipient label
  const recipientLabel = selectedIds
    ? `${selectedIds.length} selected buyer${selectedIds.length !== 1 ? 's' : ''}`
    : counts
      ? `${channel === 'SMS' ? counts.smsEligible : counts.emailEligible} active buyer${
          (channel === 'SMS' ? counts.smsEligible : counts.emailEligible) !== 1 ? 's' : ''
        } eligible`
      : null

  const sendDisabled =
    sending ||
    !body.trim() ||
    (selectedIds ? selectedIds.length === 0 : counts
      ? (channel === 'SMS' ? counts.smsEligible : counts.emailEligible) === 0
      : false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-500" />
            {selectedIds ? `Blast to ${selectedIds.length} buyer${selectedIds.length !== 1 ? 's' : ''}` : 'Buyer Blast'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {result ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Send className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-base font-semibold text-gray-900">{result.sent} messages queued</p>
            <p className="text-sm text-gray-500 mt-1">Sent via {result.channel}</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Channel selector */}
            <div className="flex gap-2 mb-4">
              {(['SMS', 'EMAIL'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    channel === c
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {recipientLabel && (
              <p className="text-xs text-gray-500 mb-3">{recipientLabel}</p>
            )}

            {channel === 'EMAIL' && (
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject line"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={channel === 'SMS' ? 'SMS message (max 160 chars)…' : 'Email body…'}
              rows={5}
              maxLength={channel === 'SMS' ? 1600 : 10000}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {channel === 'SMS' && (
              <p className="text-[11px] text-gray-400 mb-3">{body.length}/160 chars</p>
            )}

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
                    ? `Send to ${selectedIds.length}`
                    : `Send to ${counts ? (channel === 'SMS' ? counts.smsEligible : counts.emailEligible) : '…'} buyers`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
