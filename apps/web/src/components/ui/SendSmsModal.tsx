'use client'

import { useState } from 'react'
import { Loader2, MessageSquare, X } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  toPhone: string
  entityType: 'buyer' | 'vendor'
  entityId: string
}

const MAX_CHARS = 1600

export function SendSmsModal({ open, onClose, toPhone, entityType, entityId }: Props) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  if (!open) return null

  async function handleSend() {
    if (!body.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/${entityType}s/${entityId}/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: toPhone, body: body.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = typeof data.error === 'string' ? data.error : 'SMS send failed.'
        toast.error(msg)
        return
      }
      toast.success('SMS sent.')
      setBody('')
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'SMS send failed.')
    } finally {
      setSending(false)
    }
  }

  const remaining = MAX_CHARS - body.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-500" />
            Send SMS
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <p className="text-sm font-medium text-gray-900">{toPhone}</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Message *
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_CHARS))}
              rows={5}
              placeholder="Type your message…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <p className={`text-right text-[11px] mt-1 ${remaining < 100 ? 'text-amber-500' : 'text-gray-400'}`}>
              {remaining} characters remaining
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !body.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
