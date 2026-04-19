'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ToggleLeft, ToggleRight } from 'lucide-react'

interface MarketRow {
  id: string
  name: string
  state: string
  isActive: boolean
  _count: { properties: number }
}

interface Props {
  markets: MarketRow[]
}

export function MarketsPanel({ markets }: Props) {
  const router = useRouter()
  const [newName, setNewName] = useState('')
  const [newState, setNewState] = useState('TX')
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    try {
      await fetch('/api/markets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), state: newState }),
      })
      setNewName(''); setShowForm(false)
      router.refresh()
    } finally {
      setAdding(false)
    }
  }

  async function toggleActive(market: MarketRow) {
    await fetch(`/api/markets/${market.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !market.isActive }),
    })
    router.refresh()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{markets.length} markets</p>
        <button onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Add Market
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-slate-50">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Market name" required
            className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <input value={newState} onChange={(e) => setNewState(e.target.value)} placeholder="TX" maxLength={2}
            className="w-14 border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase" />
          <button type="submit" disabled={adding || !newName.trim()}
            className="bg-blue-600 text-white text-xs font-semibold rounded px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {adding ? '…' : 'Add'}
          </button>
          <button type="button" onClick={() => setShowForm(false)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
        </form>
      )}

      <div className="divide-y divide-gray-50">
        {markets.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${m.isActive ? 'text-gray-800' : 'text-gray-400'}`}>{m.name}</p>
              <p className="text-[11px] text-gray-400">{m.state} · {m._count.properties} properties</p>
            </div>
            <button onClick={() => toggleActive(m)} className="text-gray-400 hover:text-blue-600 transition-colors" title={m.isActive ? 'Deactivate' : 'Activate'}>
              {m.isActive ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
