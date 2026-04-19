'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

interface Market {
  id: string
  name: string
}

interface Props {
  open: boolean
  onClose: () => void
}

export function AddCampaignModal({ open, onClose }: Props) {
  const router = useRouter()
  const [markets, setMarkets] = useState<Market[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState<'DRIP' | 'BROADCAST'>('DRIP')
  const [description, setDescription] = useState('')
  const [marketId, setMarketId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    fetch('/api/markets').then((r) => r.json()).then(setMarkets).catch(() => {})
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type, description: description.trim() || undefined, marketId: marketId || undefined }),
      })
      if (!res.ok) throw new Error('Failed to create campaign')
      const campaign = await res.json()
      onClose()
      setName(''); setDescription(''); setMarketId('')
      router.push(`/campaigns/${campaign.id}`)
    } catch {
      setError('Failed to create campaign. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">New Campaign</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Campaign Name *</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 30-Day Seller Follow-Up"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Type *</label>
            <select
              value={type} onChange={(e) => setType(e.target.value as 'DRIP' | 'BROADCAST')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="DRIP">Drip (automated sequence)</option>
              <option value="BROADCAST">Broadcast (one-time blast)</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Market</label>
            <select
              value={marketId} onChange={(e) => setMarketId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Markets</option>
              {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Description</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Optional description..."
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()}
              className="flex-1 bg-blue-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors active:scale-95">
              {saving ? 'Creating…' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
