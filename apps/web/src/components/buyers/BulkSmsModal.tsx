'use client'

/**
 * Bulk SMS authoring modal — matches the Buyers Module spec's
 * "Send Bulk SMS" flow:
 *
 *   1. Confirmation: "You have selected X records to send the bulk SMS"
 *   2. Form: Number* | Campaign* | SMS* (textarea)
 *   3. Send → POST /api/buyers/bulk-sms → toast + close.
 *
 * Recipient resolution happens server-side via /api/buyers/bulk-sms/preview
 * which de-dupes phones and filters DND. The number shown to the operator
 * is the post-filter count, not the raw selection — consistent with what
 * will actually fire.
 */

import { useEffect, useState } from 'react'
import { Send, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface PhoneOption {
  id: string
  number: string
  friendlyName: string | null
  purpose: string
}

interface Props {
  onClose: () => void
  /** Buyer/Vendor ids the operator has manually selected. */
  selectedBuyerIds: string[]
  /** Optional filter snapshot when the operator used Select All. */
  filter?: Record<string, unknown> | null
  /** Which entity module the blast targets. Drives the API path. */
  entity?: 'buyer' | 'vendor'
  onSent?: (blastId: string) => void
}

export function BulkSmsModal({ onClose, selectedBuyerIds, filter, entity = 'buyer', onSent }: Props) {
  const apiRoot = entity === 'vendor' ? '/api/vendors' : '/api/buyers'
  const [step, setStep] = useState<'confirm' | 'compose'>('confirm')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [sample, setSample] = useState<Array<{ id: string; name: string }>>([])

  const [phones, setPhones] = useState<PhoneOption[]>([])
  const [phoneId, setPhoneId] = useState('')
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pull recipient preview + phone options when the modal opens.
  useEffect(() => {
    let aborted = false
    fetch(`${apiRoot}/bulk-sms/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerIds: selectedBuyerIds, filter: filter ?? undefined }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (aborted) return
        setPreviewCount(res?.count ?? 0)
        setSample(Array.isArray(res?.sample) ? res.sample : [])
      })
      .catch(() => setPreviewCount(0))

    fetch('/api/phone-numbers')
      .then((r) => r.json())
      .then((res) => {
        if (aborted) return
        const list = Array.isArray(res?.data) ? res.data : []
        setPhones(
          list.map((p: any) => ({
            id: p.id,
            number: p.number,
            friendlyName: p.friendlyName ?? null,
            purpose: p.purpose ?? 'general',
          })),
        )
      })
      .catch(() => {})
    return () => {
      aborted = true
    }
  }, [selectedBuyerIds, filter])

  async function send() {
    if (!phoneId || !name.trim() || !body.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`${apiRoot}/bulk-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          body: body.trim(),
          fromPhoneNumberId: phoneId,
          buyerIds: selectedBuyerIds.length ? selectedBuyerIds : undefined,
          filter: selectedBuyerIds.length ? undefined : filter ?? undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to send.')
        return
      }
      toast.success(`Bulk SMS queued — ${previewCount ?? 0} recipient${previewCount === 1 ? '' : 's'}.`)
      onSent?.(data.id)
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Failed to send.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-500" />
            Send Bulk SMS
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'confirm' ? (
          <div className="p-5 space-y-3">
            <p className="text-[13px] text-gray-600">
              {previewCount === null ? (
                <span className="inline-flex items-center gap-1.5 text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Resolving recipients…
                </span>
              ) : (
                <>
                  You have selected{' '}
                  <span className="font-semibold text-gray-900">{previewCount}</span>{' '}
                  record{previewCount === 1 ? '' : 's'} to send the bulk SMS.
                </>
              )}
            </p>
            {sample.length > 0 && (
              <div className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-[12px] text-gray-600">
                <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-1">
                  First {Math.min(sample.length, 5)} recipients
                </p>
                <ul className="space-y-0.5">
                  {sample.map((s) => (
                    <li key={s.id}>{s.name || 'Unnamed buyer'}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-gray-400">
              Recipients with Do Not Text or no phone are excluded automatically.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="text-[13px] font-medium text-gray-600 hover:text-gray-800 px-3 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep('compose')}
                disabled={!previewCount}
                className="bg-blue-600 text-white text-[13px] font-semibold rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1">
                Number <span className="text-rose-500">*</span>
              </label>
              <select
                value={phoneId}
                onChange={(e) => setPhoneId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select From Number</option>
                {phones.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatPhone(p.number)}
                    {p.purpose ? ` — ${p.purpose}` : ''}
                    {p.friendlyName ? ` — ${p.friendlyName}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1">
                Campaign <span className="text-rose-500">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 12 Main St — 1st Campaign"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1">
                SMS <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                maxLength={1600}
                placeholder="Type your message…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">{body.length}/1600 chars</p>
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep('confirm')}
                className="text-[13px] font-medium text-gray-600 hover:text-gray-800 px-3 py-2"
              >
                Back
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending || !phoneId || !name.trim() || !body.trim()}
                className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
              >
                {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {sending ? 'Sending…' : `Send to ${previewCount}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  }
  return raw
}
