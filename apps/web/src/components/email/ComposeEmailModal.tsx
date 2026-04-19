'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

interface Property {
  id: string
  streetAddress: string | null
  city: string | null
}

interface Props {
  open: boolean
  onClose: () => void
}

export function ComposeEmailModal({ open, onClose }: Props) {
  const router = useRouter()
  const [properties, setProperties] = useState<Property[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    // Fetch recent active properties for selection
    fetch('/api/leads?pageSize=50')
      .then((r) => r.json())
      .then((data) => setProperties(data.rows ?? []))
      .catch(() => {})
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!propertyId || !body.trim()) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          channel: 'EMAIL',
          direction: 'OUTBOUND',
          body: body.trim(),
          subject: subject.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed to send')
      onClose()
      setPropertyId(''); setSubject(''); setBody('')
      router.refresh()
    } catch {
      setError('Failed to send email. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Compose Email</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Property / Lead *</label>
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.streetAddress ?? 'No address'}{p.city ? `, ${p.city}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Re: Your property at…" />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Message *</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Type your email message…" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !propertyId || !body.trim()}
              className="flex-1 bg-blue-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors active:scale-95">
              {saving ? 'Sending…' : 'Send Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
